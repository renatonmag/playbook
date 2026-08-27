"""The Patterns themselves. The engine imports none of these — a pipeline names them."""

from .bar_gap import BarGap, BarGapPattern, bar_gaps
from .leg_extremes import (
    ExtremeType,
    LegExtremes,
    LegExtremesPattern,
    LegPoint,
    extreme_points,
)
from .leg_processor import Leg, LegPattern, bar_positions, position_of, split_legs
from .leg_reversals import (
    AVERAGE_WINDOW,
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    LegBar,
    LegReversals,
    LegReversalsPattern,
    MarkType,
    adjacent,
    alike,
    dominates,
    expands,
    implied_body_min,
    marked_bars,
    reverses,
)
from .leg_window import LegWindow, LegWindowPattern, split_leg_windows
from .simple_leg import LegMark, PbMark, SimpleLegPattern
from .zigzag import ZigZagIndidicator, ZigZagPattern, ZigZagPivot

__all__ = [
    "AVERAGE_WINDOW",
    "BarGap",
    "BarGapPattern",
    "DEFAULT_EXPANSION",
    "DEFAULT_K",
    "DEFAULT_SIMILARITY",
    "ExtremeType",
    "Leg",
    "LegBar",
    "LegExtremes",
    "LegExtremesPattern",
    "LegMark",
    "LegPattern",
    "LegPoint",
    "LegReversals",
    "LegReversalsPattern",
    "LegWindow",
    "LegWindowPattern",
    "MarkType",
    "PbMark",
    "SimpleLegPattern",
    "ZigZagIndidicator",
    "ZigZagPattern",
    "ZigZagPivot",
    "adjacent",
    "alike",
    "bar_gaps",
    "bar_positions",
    "dominates",
    "expands",
    "extreme_points",
    "implied_body_min",
    "marked_bars",
    "position_of",
    "reverses",
    "split_leg_windows",
    "split_legs",
]
