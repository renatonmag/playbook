"""Three bars closing the same way — the cheapest statement of direction a chart makes.

`general-direction` holds the other opinion of this kind, and the two are worth reading side by
side precisely because they disagree: that one is read off the simple legs' *pivots*, so it is
structural, smoothed, and can be anchored hundreds of bars back. This one never looks past the
bar in front of it. Three consecutive bull bars say bull; three consecutive bear bars say bear;
nothing else is consulted — not a leg, not a pivot, not a level.

The output is the **third bar of each run**, and only that bar:

```
bull bull bull bull bull bear bull bull bull
          ^                            ^
```

The rules:

- **Once per run.** A run of five marks once, on the third, and a run of thirty marks once, on
  the third. The counter passes *through* `SPAN` and keeps climbing, so the fourth bar of a run
  is not a second event. What is being reported is the moment a run became three long, and that
  moment happens once however long the run goes on to be. The cost is stated rather than hidden:
  **a long run is indistinguishable from an exact triple in this Series.** A caller that wants to
  know how far the run went has to go back to the Candles; nothing here carries a length, because
  a length would be a second reading wearing this one's name.
- **`close > open`, strict, and a doji breaks the run.** A bar closing exactly where it opened is
  neither side, so it resets the counter to zero rather than extending or restarting it. The
  shared `leans` helper was deliberately not used: its fallback reads where the close sits in the
  bar's own range, which would let a flat bar carry a run through a bar that went nowhere. "Three
  consecutive bull bars" is a claim about three bodies, and `leans` answers a different question —
  see its docstring, and `BarsPattern`, which wants exactly the answer this one does not.
- **A colour change restarts at one, not zero.** The bar that broke the run is itself the first
  bar of the next one. `bull bull bear bear bear` marks its last bar: the bear run is three long,
  counted from the bar that ended the bull run.
- **The run is counted over the window handed in.** A run that began before the first loaded bar
  reads short, and a run of three whose first two bars are off the left edge is not reported at
  all. The same caveat `bar_gap.py` carries for `closed_by`, for the same reason: there is no
  lookback dial that would fix it, only one that would make the answer stable and wrong.
- **Nothing here is provisional.** `/patterns` hands the engine closed bars only, so a run that
  reaches three on the newest bar is a run that reached three. No Point of this Series moves once
  emitted — unlike `general-direction`, whose reading repaints as the provisional mark moves.

Output is **sparse**: one Point per run that got to three, none for the bars between them, and
none at all for a window whose bars never repeat a colour three times.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe

#: How many same-side bars make a run. Not a dial: the rule *is* the three-bar rule, and changing
#: this would be a different Pattern wearing this one's name. The same stance `bar_gap.SPAN` takes.
SPAN = 3


@dataclass(frozen=True, slots=True)
class ConsecutiveDirection(Candle):
    """The bar on which a run of `SPAN` same-side bars completed, and which side it ran.

    A `Candle` and not a `Pivot`, unlike `GeneralDirection`: that one is anchored on a mark, which
    is a bar *and a price on it*, and this is anchored on nothing finer than the bar. There is no
    price a run of three closes at — the run is three bodies, and naming one of their prices would
    be this Series inventing a level it never read.

    The two bars before it are not carried either: they are the bar `SPAN - 1` back and the one
    before that, derivable from `time` and the Timeframe, and restating them would claim a fact the
    Candles already hold. The same argument `BarGap` makes about the bars that bound it.
    """

    #: Which way the three bars ran. `bullish` for three closes above their opens, `bearish` for
    #: three below. Never `None`: a bar with no side does not extend a run, so no run can complete
    #: without one.
    direction: Direction


def _side(candle: Candle) -> Direction | None:
    """Which way the body points, or `None` for a bar that closed where it opened.

    Deliberately not `leans`, and deliberately not `Shape.bear`. `leans` has a midpoint fallback
    this rule does not want (see the module docstring), and `shape_of` answers `None` for a
    zero-amplitude bar, which would make a flat bar's side depend on whether it also had a range.
    Here the question is only about the body, and the three answers are the three cases.
    """
    if candle.close > candle.open:
        return "bullish"
    if candle.close < candle.open:
        return "bearish"
    return None


def consecutive_direction(bars: Sequence[Candle]) -> list[ConsecutiveDirection]:
    """Every run of `SPAN` same-side bars in `bars`, anchored on the bar that completed it.

    Takes a plain sequence rather than a Series, for the reason `bar_gaps` gives: a run is fully
    determined by the bars it is read from, and asking for the global history would advertise a
    dependency that does not exist.

    One pass, no lookahead, and one Point emitted at the instant the counter *reaches* `SPAN` —
    which is what makes a run of thirty one Point rather than twenty-eight.
    """
    found: list[ConsecutiveDirection] = []

    running: Direction | None = None
    length = 0

    for bar in bars:
        side = _side(bar)

        if side is None:
            # A doji is not a side and does not continue one. Back to nothing, so the three bars
            # after it are a fresh run rather than the tail of the one it interrupted.
            running, length = None, 0
            continue

        # `== running` and not `is`: these are `Literal` strings, and identity on them is an
        # interning accident rather than a promise.
        length = length + 1 if side == running else 1
        running = side

        # `==` and not `>=`. Reaching `SPAN` is the event; standing past it is the same run still
        # standing, and reporting that again would make a long run a stutter of Points.
        if length == SPAN:
            found.append(ConsecutiveDirection.anchored(bar, direction=side))

    return found


class ConsecutiveDirectionPattern(Pattern):
    """`consecutive_direction`, run over the Candles of `emits`.

    **No sources and no dials**, exactly like `BarGapPattern` and for the same reason: a run of
    three is a property of three adjacent bars, not of a leg somebody cut. It reads `ctx[BARS]`,
    which the engine fills before any Pattern runs, so it has no ordering constraint and can be
    declared anywhere in a pipeline.
    """

    name = "Consecutive direction"

    def __init__(self, *, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries[ConsecutiveDirection]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            consecutive_direction(bars.points),
        )
