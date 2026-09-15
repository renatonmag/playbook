from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity, Timeframe
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def at(minutes: int) -> datetime:
    return OPEN + timedelta(minutes=minutes)


def candles(
    instrument: str = "PETR4",
    timeframe: Timeframe = "5m",
    closes: tuple[float, ...] = (10.0, 11.0, 12.0),
) -> BaseSeries[Candle]:
    return BaseSeries(
        SeriesIdentity(CANDLES, instrument, timeframe),
        [
            Candle(time=at(i * 5), open=c, high=c + 1, low=c - 1, close=c, volume=100.0)
            for i, c in enumerate(closes)
        ],
    )


@pytest.fixture
def bars() -> dict[Timeframe, BaseSeries[Candle]]:
    return {"5m": candles()}
