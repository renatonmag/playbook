"""Playbook's pattern detection engine. See CONTEXT.md and docs/adr/."""

from .candles import Candle, Pivot
from .engine import BARS, INSTRUMENT, PatternEngine
from .pattern import Ctx, Pattern
from .series import CANDLES, BaseSeries, SeriesIdentity
from .shape import ColourMode, Direction, FormaRule, Shape, colour_agrees, marks, shape_of
from .timeframes import SECONDS, Timeframe

__all__ = [
    "BARS",
    "CANDLES",
    "INSTRUMENT",
    "SECONDS",
    "BaseSeries",
    "Candle",
    "ColourMode",
    "Ctx",
    "Direction",
    "FormaRule",
    "Pattern",
    "PatternEngine",
    "Pivot",
    "SeriesIdentity",
    "Shape",
    "Timeframe",
    "colour_agrees",
    "marks",
    "shape_of",
]
