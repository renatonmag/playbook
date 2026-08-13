"""`GET /patterns` — one run of the declared pipeline, for the development chart.

**This is not a tick.** It is an inspector: it runs the pipeline once, over a window the caller
names, so the result can be drawn and judged by eye. The pipeline stays declared in code
(`playbook_api.pipeline`), and nothing here lets a caller compose one — a route that assembled
Patterns from query parameters would make the browser the author of the pipeline.

`symbol` and `timeframe` are absent for the same reason: the pipeline names the Instrument and
each Pattern declares the Timeframes it reads. The caller chooses the window and nothing else.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pattern_engine import PatternEngine
from sqlmodel import Session

from ..db import get_session
from ..pipeline import PIPELINE, SYMBOL, timeframes
from ..schemas.pattern import PatternsOut, SeriesOut
from ..store.candles import CandleWindowTooLarge, as_series, load_candles
from ..window import validate_window

router = APIRouter()

#: Matches `/candles`, so a window the chart can draw is a window the pipeline can run on.
DEFAULT_LIMIT = 1000


@router.get("/patterns", response_model=PatternsOut)
def read_patterns(
    session: Annotated[Session, Depends(get_session)],
    start: Annotated[datetime, Query(alias="from", description="Window start, ISO-8601 with offset")],
    end: Annotated[datetime, Query(alias="to", description="Window end, ISO-8601 with offset")],
    limit: Annotated[int, Query(gt=0, description="Ceiling, not a page size")] = DEFAULT_LIMIT,
) -> PatternsOut:
    """Run every declared Pattern over the window and return the Series they produced.

    A Pattern that raises does not stop the run (ADR-0004): the engine logs it and writes
    nothing under its key. That is reported here as a name in `failed` rather than a 500, so one
    broken Pattern does not hide the ones that worked. The exception itself is only in the
    server log — the engine deliberately does not carry it.
    """
    validate_window(start, end)

    try:
        bars = {
            timeframe: as_series(
                load_candles(
                    session,
                    symbol=SYMBOL,
                    timeframe=timeframe,
                    start=start,
                    end=end,
                    limit=limit,
                ),
                symbol=SYMBOL,
                timeframe=timeframe,
            )
            for timeframe in sorted(timeframes())
        }
    except CandleWindowTooLarge as too_large:
        raise HTTPException(
            400, f"window holds more than {too_large.limit} candles — narrow it or raise `limit`"
        ) from too_large

    engine = PatternEngine(bars, PIPELINE)
    ctx = engine.run()

    return PatternsOut(
        series={
            pattern.producer: SeriesOut.from_series(ctx[pattern.producer])
            for pattern in engine.patterns
            if pattern.producer in ctx
        },
        # The engine does not report who failed, but the pipeline is known, so the difference is.
        failed=[pattern.producer for pattern in engine.patterns if pattern.producer not in ctx],
    )
