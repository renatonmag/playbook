"""The Candle — the atomic unit of price data, and the root of every Point. See ADR-0002.

A Point is one element of a Series. There is no separate base class for it: a Candle already
*is* a Point, so a Pattern's Point subclasses the Candle it occurs on and adds its own
payload. Methods are allowed, but only as pure derivation — everything must be computable
from the attributes, because a Point gets serialized to Validation and to the development UI.
"""

from dataclasses import dataclass, fields
from datetime import datetime
from typing import Any, Self


@dataclass(frozen=True, slots=True)
class Candle:
    """One OHLCV bar. `time` is the instant the bar opened, in UTC.

    As the root of the Point hierarchy, `time` is also the anchor a Series orders by. A
    Pattern whose occurrence spans several Candles declares `since` — the Candle where the
    occurrence begins — on its own subclass, not here.
    """

    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @classmethod
    def anchored(cls, candle: "Candle", **payload: Any) -> Self:
        """Build a Point on `candle`: its OHLCV, plus the payload this subclass declares.

        `Sma.anchored(bar, value=12.4)` rather than restating all six Candle fields at every
        Point a Pattern packs.
        """
        carried = {f.name: getattr(candle, f.name) for f in fields(Candle)}
        return cls(**carried, **payload)


@dataclass(frozen=True, slots=True)
class Pivot(Candle):
    """A vertex a Pattern marks on the chart: the bar of the vertex, and which price on it is.

    Shared across every geometric Pattern, so a wedge and a double-top speak one vocabulary.
    """

    price: float
