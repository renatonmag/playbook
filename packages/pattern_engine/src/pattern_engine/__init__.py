"""Playbook's pattern detection engine. See CONTEXT.md and docs/adr/."""

from .candles import Candle, Pivot
from .engine import BARS, INSTRUMENT, PatternEngine
from .pattern import Ctx, Pattern
from .series import CANDLES, BaseSeries, SeriesIdentity
from .timeframes import Timeframe

__all__ = [
    "BARS",
    "CANDLES",
    "INSTRUMENT",
    "BaseSeries",
    "Candle",
    "Ctx",
    "Pattern",
    "PatternEngine",
    "Pivot",
    "SeriesIdentity",
    "Timeframe",
]
