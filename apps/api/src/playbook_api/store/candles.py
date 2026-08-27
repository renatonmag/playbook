"""Reading Candles for one Instrument at one Timeframe, over an explicit window.

The window is `[start, end]`, stated by the caller — not "the current day" worked out here.
Trading hours live in config, and the day is the caller's arithmetic; this keeps one notion of
"today" in the system instead of one per route. See issue #4.
"""

from collections.abc import Sequence
from datetime import datetime

from pattern_engine import BaseSeries, SeriesIdentity, Timeframe
from pattern_engine import Candle as Bar
from pattern_engine.series import CANDLES
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


def closed_candles(rows: Sequence[Candle], *, edge: datetime | None) -> Sequence[Candle]:
    """The rows strictly older than `edge` — everything but the bar the feed is still writing.

    The Ingestor writes the bar that is still forming and rewrites it as it fills, so its `high`,
    `low` and `close` are whatever the last write said. A Pattern reading it produces a vertex, a
    leg or a mark that moves and then disappears — an answer about a bar the market has not given
    yet. `edge` is where that bar starts: see `newest_candle_time`.

    `edge` of `None` means the table holds no Candle at all for this Instrument and Timeframe, in
    which case `rows` is empty too and the branch is a formality rather than a policy.
    """
    return [row for row in rows if edge is None or row.time < edge]


def newest_candle_time(
    session: Session, *, symbol: str, timeframe: Timeframe
) -> datetime | None:
    """When the newest stored Candle of `symbol` at `timeframe` opened — the feed's live edge.

    This is the closed-bar test's whole reference, and it is drawn from the data rather than from
    a clock. It has to be: the table's `time` values are the exchange's wall clock stamped as UTC
    (see the docblock on `apps/web/app/pages/record-bars.vue`), so a `datetime.now()` here — or a
    window end sent by a browser — sits hours away from every row and would find every bar long
    closed, including the one being written. Two timestamps from the same table cannot disagree
    that way.

    What makes it correct is the Ingestor's behaviour: it rewrites the forming bar in place, so
    the newest row *is* that bar whenever the feed is running. The cost is the other side of the
    same fact — when the feed stops, the last bar it wrote stays the newest row, so the final bar
    of a session is not read until the next session opens one past it.

    `max` over what came back rather than the first row: with `count=1` those are the same, and
    this does not quietly depend on the ordering surviving every driver.
    """
    rows = load_recent_candles(session, symbol=symbol, timeframe=timeframe, count=1)
    return max((row.time for row in rows), default=None)


def load_closed_candles(
    session: Session,
    *,
    symbol: str,
    timeframe: Timeframe,
    start: datetime,
    end: datetime,
    limit: int,
) -> Sequence[Candle]:
    """The window's Candles, minus the one the Ingestor has not finished writing.

    `load_candles` with the forming bar withheld — the same arguments, the same errors, one fewer
    bar at the live edge. A window that ends before that edge loses nothing: every row in it is
    strictly older, which is what makes a pinned window and a live one the same request here.
    """
    rows = load_candles(
        session, symbol=symbol, timeframe=timeframe, start=start, end=end, limit=limit
    )
    # The window first, the edge second. A bar opening between the two costs this run one bar of
    # lag — it withholds a bar that closed a moment ago. The other order fails the other way: a
    # stale edge admits the forming bar, which is the whole thing this exists to prevent.
    if not rows:
        return rows
    return closed_candles(rows, edge=newest_candle_time(session, symbol=symbol, timeframe=timeframe))


def as_series(
    rows: Sequence[Candle], *, symbol: str, timeframe: Timeframe
) -> BaseSeries[Bar]:
    """Database rows as the Series the engine reads — the base case, produced by no Pattern.

    The conversions mirror `CandleOut.from_row`, because the engine and the chart want the same
    two things: `Decimal` prices as `float`, and a null volume as zero. What differs is `time`,
    which stays an aware `datetime` here — the Series orders and bisects on it, and only the
    wire format wants Unix seconds.
    """
    return BaseSeries(
        SeriesIdentity(CANDLES, symbol.upper(), timeframe),
        [
            Bar(
                time=row.time,
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=float(row.volume or 0),
            )
            for row in rows
        ],
    )


def load_recent_candles(
    session: Session,
    *,
    symbol: str,
    timeframe: Timeframe,
    count: int,
) -> Sequence[Candle]:
    """The `count` most recent Candles of `symbol` at `timeframe`, oldest first.

    The live edge, asked for without a window: a poller wants "whatever is newest now", and
    computing a window for that would put a second notion of "now" in the system — the thing
    `load_candles`' docstring exists to prevent.

    Descending in the query, ascending in the answer. The ordering contract is the same one
    `load_candles` documents, and the chart's `update()` depends on it: a bar handed over out of
    order is refused by the library, not merely drawn wrong.
    """
    statement = (
        select(Candle)
        .where(Candle.symbol == symbol.upper())
        .where(Candle.timeframe == _TIMEFRAME_CODES[timeframe])
        .order_by(Candle.time.desc())  # type: ignore[attr-defined]
        .limit(count)
    )

    return list(reversed(session.exec(statement).all()))
