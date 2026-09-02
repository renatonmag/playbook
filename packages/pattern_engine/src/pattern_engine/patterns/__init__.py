"""The Patterns themselves. The engine imports none of these — a pipeline names them."""

from .advancing_legs import AdvancingLeg, AdvancingLegsPattern, advancing_legs, trim_tail
from .bar_gap import BarGap, BarGapPattern, bar_gaps
from .general_direction import GeneralDirection, GeneralDirectionPattern, general_direction
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
from .nested_legs import NestedLegs, NestedLegsPattern, nested_legs
from .simple_leg import LegMark, PbMark, SimpleLegPattern
from .trend_lines import LineEnd, TrendLine, TrendLinesPattern, clear, leg_ends, trend_lines
from .zigzag import ZigZagIndidicator, ZigZagPattern, ZigZagPivot

__all__ = [
    "AVERAGE_WINDOW",
    "AdvancingLeg",
    "AdvancingLegsPattern",
    "BarGap",
    "BarGapPattern",
    "DEFAULT_EXPANSION",
    "DEFAULT_K",
    "DEFAULT_SIMILARITY",
    "ExtremeType",
    "GeneralDirection",
    "GeneralDirectionPattern",
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
    "LineEnd",
    "MarkType",
    "NestedLegs",
    "NestedLegsPattern",
    "PbMark",
    "SimpleLegPattern",
    "TrendLine",
    "TrendLinesPattern",
    "ZigZagIndidicator",
    "ZigZagPattern",
    "ZigZagPivot",
    "adjacent",
    "advancing_legs",
    "alike",
    "bar_gaps",
    "bar_positions",
    "clear",
    "dominates",
    "expands",
    "extreme_points",
    "general_direction",
    "implied_body_min",
    "leg_ends",
    "marked_bars",
    "nested_legs",
    "position_of",
    "reverses",
    "split_leg_windows",
    "split_legs",
    "trend_lines",
    "trim_tail",
]
