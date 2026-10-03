"""The oldest wick of the last few bars that no close has taken out since, on the running leg's side.

A level the market printed recently and has not yet closed beyond. Which extreme is asked about is
the running simple leg's: a bull leg is heading *up*, so the question is the highs ahead of it; a
bear leg is heading down, so it is the lows. That is the whole of what the leg contributes — the
wick itself is read off the bars, never off a mark.

- **Broken means a close beyond it, strictly.** A bull leg's high is broken by a later bar that
  *closed* above it; a wick poking through and closing back inside does not count, and neither does
  a close exactly at it. A wick through a level is the market testing it, and a close is the market
  accepting the other side — the same distinction `trend-lines` draws between a wick and a body.
- **The oldest survivor, not the extreme.** Walk forward through the window and stop at the first
  bar whose wick every later close stayed inside. The window's own maximum high could never be
  broken by a close inside the window — a close above it would need a high above it — so "the
  highest unbroken" would only ever be the max, and this asks something the max does not: how far
  back the unaccepted levels reach. The answer is often the max anyway, and it is allowed to be.
- **The newest bar always qualifies**, having nothing after it to break it. So the Series is
  never empty while there are bars and a running leg; on a straight run where every bar closed past
  the one before, the answer *is* the newest bar, and that is a true statement about the window
  rather than a degenerate one.
- **Only closes inside the window are consulted.** The oldest bar of the window is not asked whether
  something before it was broken; the lookback bounds both the candidates and the breakers.

**The running leg** is read off `simple-leg`'s last Point, on `GeneralDirectionPattern`'s terms and
not `PivotOffsetPattern`'s — this is about the turn in progress, so the provisional mark is exactly
the one wanted:

- provisional → its own side: the leg would end on a `high`, so it is a bull leg;
- settled on the newest bar → the *other* side: that mark closes a leg, and a bar holds one mark, so
  the leg opening on it has no Point of its own and runs the opposite way.

A settled last mark on an older bar does not happen — `SimpleLegPattern` appends a provisional
Point whenever the newest bar is unmarked — but if it did, the same flip is the right reading: the
leg that mark closed is over.

**At most one Point, and it repaints**, exactly as `pivot-offset` does: this is a reading of the
right edge, a new bar can move it anywhere inside the window or flip its side, and the history of
past answers is not recoverable from the Series.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Candle, Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .simple_leg import LegMark, _missing, integer

type Side = Literal["high", "low"]

#: The side across a mark. A leg that ended on a high is followed by one heading for a low.
_OTHER: dict[Side, Side] = {"high": "low", "low": "high"}


@dataclass(frozen=True, slots=True)
class UnbrokenWick(Pivot):
    """The bar whose wick survived, and which of its extremes the level is.

    A `Pivot` and not a bare `Candle`, unlike `pivot-offset`: the answer *is* a price — the level
    nobody has closed beyond — and the overlay places itself on it.
    """

    #: `"high"` while the running leg is bull, `"low"` while it is bear. `price` is that extreme.
    direction: Side


def running_side(marks: Sequence[LegMark]) -> Side | None:
    """The side the leg still in progress would end on, or `None` with no marks at all.

    `"high"` is a bull leg and `"low"` a bear one, `simple-leg`'s own vocabulary. See the module
    docstring for why a settled last mark is flipped.
    """
    if not marks:
        return None
    last = marks[-1]
    return last.direction if last.provisional else _OTHER[last.direction]


def _breaks(close: float, level: float, side: Side) -> bool:
    """Whether a close took out `level` — beyond it on `side`, strictly, compared as integers."""
    if side == "high":
        return integer(close) > integer(level)
    return integer(close) < integer(level)


def unbroken_wick(bars: Sequence[Candle], side: Side | None, lookback: int) -> list[UnbrokenWick]:
    """The oldest bar of the last `lookback` whose `side` extreme no later close went beyond.

    Plain sequences rather than Series, as every rule here takes: the answer is fully determined by
    the bars and the side. A list rather than an optional Point, `pivot_offset`'s reason — the
    adapter has nothing to branch on.

    A bar with a missing extreme is never a candidate, and a missing close never breaks anything:
    `integer` turns both into `nan`, which compares false either way.
    """
    if side is None or lookback <= 0:
        return []

    window = [bar for bar in bars[-lookback:] if not _missing({"high": bar.high, "low": bar.low})]
    for index, bar in enumerate(window):
        level = bar.high if side == "high" else bar.low
        if not any(_breaks(later.close, level, side) for later in window[index + 1 :]):
            return [UnbrokenWick.anchored(bar, price=level, direction=side)]
    return []


class UnbrokenWickPattern(Pattern):
    """`unbroken_wick` as a Pattern: the running simple leg's side, asked of the newest bars.

    - `source` — the `SimpleLegPattern` whose last Point says which way the leg is running. An
      instance and not a producer key, the reason every sourced Pattern here gives.
    - `lookback` — how many of the newest closed bars are both the candidates and the breakers.

    Declare it after `source`: declaration order is run order.
    """

    name = "Unbroken wick"

    def __init__(
        self,
        *,
        source: Pattern,
        lookback: int,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.lookback = lookback

    def run(self, ctx: Ctx) -> BaseSeries[UnbrokenWick]:
        """Zero or one Point, anchored on the surviving wick's bar."""
        marks: BaseSeries[LegMark] = ctx[self.source.producer]
        bars = ctx[BARS][self.emits]

        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            unbroken_wick(bars.points, running_side(marks.points), self.lookback),
        )
