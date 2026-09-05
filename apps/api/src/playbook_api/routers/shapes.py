"""`GET /shapes` — the Candle proportions the rule bench is built on.

**This route measures; it does not judge.** It answers with `upper`, `lower`, `body` and the
colour, and takes no rule parameters at all. That is deliberate, and the reason is this route's
own rather than borrowed: the bench holds every one of these rows already and composes rules over
them with no round trip, so a `wf_min` here would buy nothing and would create a second place a
rule can live — one that no screen names and nothing compares against the client's.

`/patterns` did have to open that door, for `bars` alone: it applies its rule inside the engine,
over quantities that never cross the wire — the average amplitude behind a bar above all — so the
browser cannot evaluate it the way it evaluates these rows. That argument does not reach this route, and until it does, `/shapes`
measures and the client judges.

Separate from `/candles` because the two have opposite appetites. The chart wants a few hundred
bars with their prices; the bench wants every bar there is, without them — `/candles` caps at
1000 and answers 400 above it, which is right for a chart and useless here.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pattern_engine import Timeframe, shape_of
from sqlmodel import Session

from ..db import get_session
from ..schemas.shape import ShapeOut
from ..store.candles import CandleWindowTooLarge, as_series, load_candles
from ..window import validate_window

router = APIRouter()

#: How many Candles one request may measure. Far above `/candles`' 1000 because a Shape is a
#: quarter the size of a bar and the bench wants the whole history at once — `WIN@N` holds about
#: 20k `5m` Candles today. Still a ceiling, so a runaway window is an error and not a timeout.
SHAPES_LIMIT = 50_000


@router.get("/shapes", response_model=list[ShapeOut])
def read_shapes(
    session: Annotated[Session, Depends(get_session)],
    symbol: Annotated[str, Query(description="Instrument ticker, e.g. PETR4")],
    timeframe: Annotated[Timeframe, Query(description="Bar interval, lowercase")],
    start: Annotated[datetime, Query(alias="from", description="Window start, ISO-8601 with offset")],
    end: Annotated[datetime, Query(alias="to", description="Window end, ISO-8601 with offset")],
    limit: Annotated[int, Query(gt=0, description="Ceiling, not a page size")] = SHAPES_LIMIT,
) -> list[ShapeOut]:
    """The Shape of every Candle of one Instrument at one Timeframe over a window, oldest first.

    Candles with no amplitude are **omitted**, not reported as null: `high == low` is a bar that
    traded at one price and has no proportions to measure. That makes the response shorter than
    the Candle count, which is the honest answer — a rule cannot mark a bar that has no shape.
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

    # Through `as_series` rather than off the rows directly, so the Decimal-to-float and
    # null-volume conversions happen in the one place that already owns them.
    candles = as_series(rows, symbol=symbol, timeframe=timeframe)

    measured = ((candle, shape_of(candle)) for candle in candles)
    return [ShapeOut.of(candle, shape) for candle, shape in measured if shape is not None]
