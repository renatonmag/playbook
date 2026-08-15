"""Playbook's pattern detection engine. See CONTEXT.md and docs/adr/."""

from .candles import Candle, Pivot
from .engine import BARS, INSTRUMENT, PatternEngine
from .pattern import Ctx, Pattern
from .series import CANDLES, BaseSeries, SeriesIdentity
from .shape import Direction, Shape, shape_of
from .timeframes import Timeframe

__all__ = [
    "BARS",
    "CANDLES",
    "INSTRUMENT",
    "BaseSeries",
    "Candle",
    "Ctx",
    "Direction",
    "Pattern",
    "PatternEngine",
    "Pivot",
    "SeriesIdentity",
    "Shape",
    "Timeframe",
    "shape_of",
]
