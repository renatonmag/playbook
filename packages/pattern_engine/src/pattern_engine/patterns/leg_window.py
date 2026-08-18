"""Each leg, plus the bars that came immediately after it.

`split_legs` stops at the turn: a `Leg` runs pivot to pivot and ends there. But the bar types
this project hunts — a record bar, the second bar of a reversal pair — do not respect that
boundary. One of them can land a bar or two *past* the closing Pivot, in the opening bars of the
leg that follows, and a rule reading a `Leg` cannot see it at all.

`split_leg_windows` is the same slice with a tail glued on: the leg, plus `ahead` further bars.
`LegWindowPattern` at the bottom is the adapter that makes it a Pattern. This is a **sibling** of
`LegPattern`, not a replacement — both run, under separate producer keys, and neither moves.

The rules, and where they agree and disagree with `split_legs`:

- Pivots are found by `time`, via the same `pivot_marks`. One copy of that rule, deliberately:
  what a mismatched pipeline does is a decision, and a decision written twice diverges in silence.
- A leg still runs from one Pivot to the next, inclusive at both ends, and the head of the window
  is still folded into the first leg. Nothing about a leg's *boundaries* changes.
- After the closing Pivot come `ahead` more bars. They are the opening bars of the next leg, so
  consecutive `LegWindow`s overlap by `ahead + 1` bars rather than by one.
- The **last** leg swallows the whole remainder of the window, exactly as `split_legs` does — not
  `ahead` bars but every bar that is left. Its tail is unbounded.
- Fewer than two Pivots yields **nothing**, for zero *and* for one. This is the one place the two
  slicers disagree: `split_legs` answers a single Pivot with the whole window, which is honest
  because a `Leg` is only a list of bars and claims nothing. A `LegWindow` cannot answer without
  saying where the leg starts and ends, and with one vertex there is no leg to point at.
- `LegWindow` anchors on its **first** bar, like `Leg`, so `as_of` answers "which leg is running
  now".

`since` and `end` are the point of the class. They are **indices into `bars`, inclusive at both
ends**, because the operation they exist for is slicing:

- the leg itself is `bars[since : end + 1]`
- the tail — the bars this class was written for — is `bars[end + 1 :]`, which never contains the
  closing Pivot
- the folded head, on the first leg only, is `bars[:since]`

That makes the head identifiable rather than silently mixed in, which is the one flaw of
`split_legs` this class does not inherit.

What it does cost, stated rather than hidden:

- `bars[-1]` is a lookahead bar, never the turn — for *every* leg, not just the edge ones. This
  is why `LegWindow` subclasses `Candle` and not `Leg`: code written against a `Leg` reaches for
  `bars[-1]` expecting a Pivot, and an `isinstance` relationship would promise it wrongly.
- `since > 0` only on the first leg, where the window's head sits before the opening Pivot. That
  head belongs to a leg that was never emitted and runs the other way.
- A short tail is silent. `bars[end + 1 :]` holds fewer than `ahead` bars when the window ends
  first — reachable only on the second-to-last leg, since the last one takes the remainder.
- The OHLCV inherited from `Candle` is the anchor bar's and says nothing about the leg.
- Every bar is now serialized more often still: twice within this Series alone, since each leg's
  tail is the next leg's opening bars.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle, Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_processor import pivot_marks


@dataclass(frozen=True, slots=True)
class LegWindow(Candle):
    """One leg and what followed it: the bars, and where the leg sits among them.

    Anchored on `bars[0]`, which is the opening Pivot on every leg but the first — there the
    window's head comes before it, and `since` is what says so.
    """

    bars: tuple[Candle, ...]
    #: Index of the opening Pivot in `bars`, inclusive. `0` except on the first leg.
    since: int
    #: Index of the closing Pivot in `bars`, inclusive. The tail is everything after it.
    end: int


def split_leg_windows(
    bars: Sequence[Candle], pivots: Sequence[Pivot], ahead: int
) -> list[LegWindow]:
    """One `LegWindow` per leg, in order: the leg's bars plus `ahead` more after its close.

    Returns the Points themselves rather than raw slices — three values per leg handed back as a
    bare tuple is where an off-by-one hides, and `LegWindow` is a plain dataclass that knows
    nothing about Series, so the split this package keeps is not broken by building it here.

    Empty for fewer than two Pivots. Raises `ValueError` for a Pivot on no bar of `bars`.
    """
    marks = pivot_marks(bars, pivots)
    if len(marks) < 2:
        return []

    windows = []
    last = len(marks) - 2
    for index, (start, close) in enumerate(zip(marks, marks[1:])):
        # The first leg keeps the window's head, and the last keeps every bar that is left; both
        # are `split_legs`' fold, unchanged. Only the legs in between get a tail of exactly
        # `ahead` — and even theirs comes up short if the window ends inside it.
        low = 0 if index == 0 else start
        high = len(bars) if index == last else close + 1 + ahead
        window = bars[low:high]
        windows.append(
            LegWindow.anchored(
                window[0], bars=tuple(window), since=start - low, end=close - low
            )
        )
    return windows


class LegWindowPattern(Pattern):
    """`split_leg_windows` as a Pattern: legs carrying the bars that came after them.

    `source` is the detector's **instance**, not its producer key, for the reason `LegPattern`
    gives: passing the key as a string restates what `Pattern.producer` derives, and the two fall
    out of step as a `KeyError` at run time rather than an error at import.

    `ahead` has no default. It is a tuning knob for whatever rule reads the tail, not a property
    of the slicing, so it belongs at the pipeline site where someone tuning it will look — the
    same argument `ZigZagPattern` makes for `depth`. It is not validated, also like `depth`:
    `ahead=0` simply leaves no tail.

    Declare it *after* its source. There is no dependency graph, and the wrong order leaves the
    key absent from `ctx` with the reason only in the log.
    """

    def __init__(
        self,
        *,
        source: Pattern,
        ahead: int,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.ahead = ahead

    def run(self, ctx: Ctx) -> BaseSeries[LegWindow]:
        """Slice `emits`' Candles at `source`'s vertices, extend each leg, pack one Point per leg.

        Anchors are non-decreasing for free: successive legs start at successive Pivots, and the
        tails extend the *end* of a window, never its start, so `BaseSeries` has nothing to
        object to.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        pivots: BaseSeries[Pivot] = ctx[self.source.producer]

        points = split_leg_windows(bars.points, pivots.points, self.ahead)

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
