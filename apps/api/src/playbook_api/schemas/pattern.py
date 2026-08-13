"""A Pattern's output as the development chart consumes it.

The payload is deliberately **total**: every field of every Point crosses the wire, including
the OHLCV of the bar the Point sits on. This screen exists to judge whether a Pattern computes
the right thing, and a trimmed payload turns that judgement into guesswork — you cannot tell a
vertex placed on the wrong bar from a vertex priced wrong if the bar is not there to compare
against.

One thing is converted, and only here: `time` becomes Unix seconds, matching `CandleOut` so the
client passes both payloads to the chart without a `.map()`. `BaseSeries.to_dict()` stays what
ADR-0002 says it is, and the engine never learns what a chart wants.
"""

from datetime import datetime
from typing import Any, Self

from pattern_engine import BaseSeries
from pydantic import BaseModel


class SeriesOut(BaseModel):
    """One Pattern's Series: who produced it, and its Points.

    `points` is untyped on purpose — each Pattern declares its own Point, and enumerating them
    here would mean this schema changing every time a Pattern is added.
    """

    identity: dict[str, str]
    points: list[dict[str, Any]]

    @classmethod
    def from_series(cls, series: BaseSeries) -> Self:
        payload = series.to_dict()
        return cls(
            identity=payload["identity"],
            points=[_seconds(point) for point in payload["points"]],
        )


class PatternsOut(BaseModel):
    """Everything one run produced, plus what it failed to produce.

    `failed` exists because an absent key and an empty Series are different facts that look
    identical on a chart: a Pattern that raised drew nothing, and so did a Pattern that ran and
    found nothing. Without this list the screen cannot tell you which one you are looking at.
    """

    series: dict[str, SeriesOut]
    failed: list[str]


def _seconds(value: Any) -> Any:
    """Every `datetime` in a Point becomes Unix seconds, however deeply it is nested.

    Recursive because a Point may carry another Candle — a zigzag vertex holds the Candle its
    leg began on — and that nested `time` has to reach the chart in the same units as the rest.
    """
    if isinstance(value, datetime):
        return int(value.timestamp())
    if isinstance(value, dict):
        return {key: _seconds(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_seconds(item) for item in value]
    return value
