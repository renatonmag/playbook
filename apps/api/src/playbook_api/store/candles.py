"""Reading Candles for one Instrument at one Timeframe, over an explicit window.

The window is `[start, end]`, stated by the caller — not "the current day" worked out here.
Trading hours live in config, and the day is the caller's arithmetic; this keeps one notion of
"today" in the system instead of one per route. See issue #4.
"""

from collections.abc import Sequence
from datetime import datetime

from pattern_engine import Timeframe
from sqlmodel import Session, select

from ..models.candle import Candle


#: The `timeframe` codes as the table actually stores them — MetaTrader's convention, letter
#: before number, which is *not* the glossary's `5m` uppercased. Nothing outside this module
#: should ever see these strings.
_TIMEFRAME_CODES: dict[Timeframe, str] = {
    "5m": "M5",
    "15m": "M15",
    "1h": "H1",
    "1d": "D1",
}


class CandleWindowTooLarge(Exception):
    """The window holds more Candles than `limit` allows.

    Raised instead of truncating: a short answer that looks complete is worse than an error,
    because a chart drawn from it looks like a normal chart.
    """

    def __init__(self, limit: int) -> None:
        self.limit = limit
        super().__init__(f"window holds more than {limit} candles")


def load_candles(
    session: Session,
    *,
    symbol: str,
    timeframe: Timeframe,
    start: datetime,
    end: datetime,
    limit: int,
) -> Sequence[Candle]:
    """The Candles of `symbol` at `timeframe` whose `time` falls in `[start, end]`, oldest first.

    Ordering is ascending because it is what both the Series contract and the chart require —
    `BaseSeries` raises on unordered Points, and `setData` wants earlier times first.

    An empty result is not an error. A closed market, a ticker with no history and a day with
    no trades all legitimately have no Candles, and the caller can already tell those apart by
    what it asked for.
    """
    # Translating here is what lets the rest of the system speak the glossary's lowercase `5m`
    # and never learn that the table says `M5`.
    statement = (
        select(Candle)
        .where(Candle.symbol == symbol.upper())
        .where(Candle.timeframe == _TIMEFRAME_CODES[timeframe])
        .where(Candle.time >= start)
        .where(Candle.time <= end)
        .order_by(Candle.time)  # type: ignore[arg-type]
        .limit(limit + 1)  # one over, so a full window is distinguishable from an overflowing one
    )

    rows = session.exec(statement).all()
    if len(rows) > limit:
        raise CandleWindowTooLarge(limit)
    return rows
