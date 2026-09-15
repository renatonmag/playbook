"""Each leg, where it turned, and the bars that came after it.

`split_legs` stops at the turn: a `Leg` runs vertex to vertex and ends there. Two things it
cannot say, and this module exists for both.

**What came after.** The bar types this project hunts — a record bar, the second bar of a
reversal pair — do not respect the leg's closing vertex. One can land a bar or two *past* it, in
the opening bars of the leg that follows, where a `Leg` cannot see it at all. So every leg here
carries `ahead` further bars.

**Where the leg actually began.** `ZigZagPivot.since` names the bar where the leg ending at that
vertex turned — "the extreme that was *current at that instant*, which is not the same thing as
the vertex the cleanup later elects", as `zigzag.py` puts it. `_last_start` searches the
half-open range `[previous vertex, this vertex)`, so that bar sits **strictly inside** the leg it
closes, at or after the opening vertex and always before the closing one. A leg running from bar
14 to bar 42 can have turned at bar 18.

That is what `since` is, and why it is read off the Pivot rather than derived from the slicing:
derived, it would be `0` every time, and the whole fact would be gone. `end` is the closing
vertex.

```
bars:  [ opening vertex ......... turn ......... closing vertex ] + ahead more
index:   0                        since                     end     end+1 ..
```

- `bars[0 : end + 1]` — the segment between two vertices, which is what `split_legs` calls a leg
- `bars[since : end + 1]` — the leg **as it actually ran**, from the turn; one bar when no turn
  was recorded, since `since` is then `end`
- `bars[end + 1 :]` — the tail this module was written for; it never contains the closing vertex

The rules, and where they agree and disagree with `split_legs`:

- Vertices are found by `time` through the same `bar_positions`/`position_of`, so the orphan rule
  is written once. The `since` bars are looked up the same way.
- A leg still runs from one vertex to the next, inclusive at both ends, so consecutive legs still
  share their boundary bar — and now also the `ahead` bars after it, overlapping by `ahead + 1`.
- The window's head is **dropped**, unlike `split_legs`, which folds it into the first leg. Bars
  before the first vertex belong to a leg that was never emitted, and with `since` spoken for
  there is no index left to mark where they end. `bars[0]` is a vertex on every leg, no exception.
- The **last** leg still swallows the whole remainder of the window, exactly as `split_legs`
  does — not `ahead` bars but every bar that is left. Its tail alone is unbounded.
- Fewer than two vertices yields **nothing**, for zero *and* for one. `split_legs` answers a
  single vertex with the whole window, which is honest there because a `Leg` is only a list of
  bars and claims nothing. A `LegWindow` cannot answer without naming an `end` that is not there.
- `LegWindow` anchors on its **first** bar, like `Leg`, so `as_of` answers "which leg is running
  now".

What it costs, stated rather than hidden:

- **This is a zigzag-only slicer.** `since` is a `ZigZagPivot` field; `LegMark` deliberately has
  none, and `SimpleLegPattern` as a source raises `AttributeError`. `LegPattern` takes either.
- `since == end` when the zigzag recorded no turn for that leg. That is a **sentinel, not a
  guess**: `_last_start` searches the half-open range `[previous vertex, this vertex)`, which
  excludes the closing vertex, so a recorded turn always satisfies `since < end` and can never
  produce this value. The cost is that `bars[since : end + 1]` is a single bar on those legs —
  read it as "no body was recorded", not as a one-bar leg. It is deliberately not `0`, which
  would claim the leg turned at its opening vertex, precisely what `_last_start` refuses to say.
- `bars[-1]` is a lookahead bar, never the turn — for *every* leg, not just the edge ones. This
  is why `LegWindow` subclasses `Candle` and not `Leg`: code written against a `Leg` reaches for
  `bars[-1]` expecting a vertex, and an `isinstance` relationship would promise it wrongly.
- A short tail is silent. `bars[end + 1 :]` holds fewer than `ahead` bars when the window ends
  first — reachable only on the second-to-last leg, since the last one takes the remainder.
- The OHLCV inherited from `Candle` is the anchor bar's and says nothing about the leg.
- Every bar is serialized more often still: twice within this Series alone, since each leg's tail
  is the next leg's opening bars.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_processor import bar_positions, position_of
from .zigzag import ZigZagPivot


@dataclass(frozen=True, slots=True)
class LegWindow(Candle):
    """One leg, where it turned, and what followed it. Anchored on its opening vertex.

    `since` and `end` are indices into `bars`, **inclusive**, because the operation they exist
    for is slicing. See the module docstring for the diagram.
    """

    bars: tuple[Candle, ...]
    #: Index of the bar the closing vertex says the leg turned on — at or after `0`, always
    #: strictly before `end`. Equal to `end` when the zigzag recorded no turn at all; see the
    #: module docstring for why that value cannot be a real one.
    since: int
    #: Index of the closing vertex, inclusive. The tail is everything after it.
    end: int


def split_leg_windows(
    bars: Sequence[Candle], pivots: Sequence[ZigZagPivot], ahead: int
) -> list[LegWindow]:
    """One `LegWindow` per leg, in order: vertex to vertex, plus `ahead` bars past the close.

    Takes `ZigZagPivot`s specifically, not any `Pivot`: `since` is read off the vertex that
    *closes* each leg, and no other detector records it.

    Returns the Points themselves rather than raw slices — three values per leg handed back as a
    bare tuple is where an off-by-one hides, and `LegWindow` is a plain dataclass that knows
    nothing about Series, so the split this package keeps is not broken by building it here.

    Empty for fewer than two vertices. Raises `ValueError` for a vertex on no bar of `bars`.
    """
    positions = bar_positions(bars)
    marks = [position_of(pivot, positions) for pivot in pivots]
    if len(marks) < 2:
        return []

    windows = []
    last = len(marks) - 2
    for index, (start, close) in enumerate(zip(marks, marks[1:])):
        # No head fold, unlike `split_legs`: a leg begins at its opening vertex, and the bars
        # before the first one are dropped. The last leg keeps every bar that is left — that
        # fold stays. Only the legs in between get a tail of exactly `ahead`, and even theirs
        # comes up short if the window ends inside it.
        high = len(bars) if index == last else close + 1 + ahead
        # The turn belongs to the vertex that *closes* the leg, which is why this reads
        # `pivots[index + 1]` and not `pivots[index]`. With no turn recorded, `since` collapses
        # onto `end` — a value a recorded turn can never take, so the two stay distinguishable.
        turn = pivots[index + 1].since
        windows.append(
            LegWindow.anchored(
                bars[start],
                bars=tuple(bars[start:high]),
                since=position_of(turn, positions) - start if turn is not None else close - start,
                end=close - start,
            )
        )
    return windows


class LegWindowPattern(Pattern):
    """`split_leg_windows` as a Pattern: legs that say where they turned and what followed.

    **Zigzag-only**, unlike `LegPattern`, which takes any `BaseSeries[Pivot]`. `since` is a
    `ZigZagPivot` field, so a `SimpleLegPattern` source raises `AttributeError` here — logged by
    the engine, and reported by the route under `failed`, with nothing written to `ctx`.

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
        # An instance attribute for the same reason `LegPattern`'s is, in advance of the same
        # collision: the tail length is the only thing that would separate two of these, and it
        # is the one thing worth reading off the label.
        self.name = f"Legs +{ahead} bars"

    def run(self, ctx: Ctx) -> BaseSeries[LegWindow]:
        """Slice `emits`' Candles at `source`'s vertices, extend each leg, pack one Point per leg.

        Anchors are the opening vertices, so they strictly increase and `BaseSeries` has nothing
        to object to: the tails extend the *end* of a window, never its start.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.source.producer]

        points = split_leg_windows(bars.points, pivots.points, self.ahead)

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
