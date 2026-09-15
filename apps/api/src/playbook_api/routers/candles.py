"""`GET /candles` — the read the development chart is built on."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pattern_engine import Timeframe
from sqlmodel import Session

from ..db import get_session
from ..schemas.candle import CandleOut
from ..store.candles import CandleWindowTooLarge, load_candles
from ..window import validate_window

router = APIRouter()

#: How many Candles one request may return before it is refused. A day of 5m bars on B3 is
#: about 108, so this leaves room for several sessions without inviting a decade of history.
DEFAULT_LIMIT = 1000


@router.get("/candles", response_model=list[CandleOut])
def read_candles(
    session: Annotated[Session, Depends(get_session)],
    symbol: Annotated[str, Query(description="Instrument ticker, e.g. PETR4")],
    timeframe: Annotated[Timeframe, Query(description="Bar interval, lowercase")],
    start: Annotated[datetime, Query(alias="from", description="Window start, ISO-8601 with offset")],
    end: Annotated[datetime, Query(alias="to", description="Window end, ISO-8601 with offset")],
    limit: Annotated[int, Query(gt=0, description="Ceiling, not a page size")] = DEFAULT_LIMIT,
) -> list[CandleOut]:
    """The Candles of one Instrument at one Timeframe over an explicit window, oldest first.

    `limit` is a ceiling: a window holding more than it is a 400, never a truncated answer.
    An empty window is a 200 with `[]` — a closed market is not a missing route.
    """
    validate_window(start, end)

    try:
        rows = load_candles(
            session, symbol=symbol, timeframe=timeframe, start=start, end=end, limit=limit
        )
    except CandleWindowTooLarge as too_large:
        raise HTTPException(
            400, f"window holds more than {too_large.limit} candles — narrow it or raise `limit`"
        ) from too_large

    return [CandleOut.from_row(row) for row in rows]
