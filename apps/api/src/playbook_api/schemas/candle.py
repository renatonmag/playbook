"""The Candle as the chart consumes it.

Shaped for TradingView Lightweight Charts so the client can pass the payload straight to
`series.setData(...)` with no `.map()` — a conversion in the browser is where a timezone bug
would hide, and a chart shifted by three hours still looks like a chart.
"""

from decimal import Decimal
from typing import Self

from pydantic import BaseModel

from ..models.candle import Candle


class CandleOut(BaseModel):
    """One bar. `time` is a Unix timestamp in seconds — the library's `UTCTimestamp`.

    `symbol` and `timeframe` are deliberately absent: they are constant across the response
    and the caller already named them in the request, so repeating them on every bar is
    redundancy that can drift.
    """

    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @classmethod
    def from_row(cls, row: Candle) -> Self:
        """The one place a database row becomes wire data.

        Three conversions live here and nowhere else: aware datetime to Unix seconds,
        `Decimal` to `float`, and a null volume to zero. The last one is lossy — a bar with no
        trades and a bar with zero volume become the same thing — and is accepted because the
        chart needs a number.
        """
        return cls(
            time=int(row.time.timestamp()),
            open=_as_float(row.open),
            high=_as_float(row.high),
            low=_as_float(row.low),
            close=_as_float(row.close),
            volume=float(row.volume or 0),
        )


def _as_float(price: Decimal) -> float:
    """Prices are `numeric` in Postgres, so they arrive as `Decimal`.

    Float is what the engine's numeric stack and the chart both speak, and the representation
    error (~1e-14 at B3 magnitudes) is invisible to both display and pattern comparison.
    Playbook places no orders, so no money arithmetic accumulates it.
    """
    return float(price)
