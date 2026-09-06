"""The Patterns themselves. The engine imports none of these — a pipeline names them."""

from .advancing_legs import AdvancingLeg, AdvancingLegsPattern, advancing_legs, trim_tail
from .bar_gap import BarGap, BarGapPattern, bar_gaps
from .bars import BarMark, BarsPattern
from .general_direction import GeneralDirection, GeneralDirectionPattern, general_direction
from .leg_extremes import (
    ExtremeType,
    LegExtremes,
    LegExtremesPattern,
    LegPoint,
    extreme_points,
)
from .leg_processor import Leg, LegPattern, bar_positions, position_of, split_legs
from .leg_reversals import LegBar, LegReversals, LegReversalsPattern, marked_bars
from .leg_window import LegWindow, LegWindowPattern, split_leg_windows
from .line_relations import (
    NO_LINES,
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    RelationKind,
    Side,
    Wick,
    breaks_out,
    line_relations,
    side_of,
    touches,
)
from .nested_legs import NestedLegs, NestedLegsPattern, nested_legs
# Re-exported from here rather than from `leg_reversals`, where they used to live: they are the
# arithmetic two Patterns share, and the names a pipeline imports must not move because of it.
from .reversal_filters import (
    AVERAGE_WINDOW,
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    MarkType,
    adjacent,
    alike,
    dominates,
    expands,
    implied_body_min,
    nests,
    reverses,
)
from .simple_leg import LegMark, PbMark, SimpleLegPattern
from .trend_lines import LineEnd, TrendLine, TrendLinesPattern, clear, leg_ends, trend_lines
from .zigzag import ZigZagIndidicator, ZigZagPattern, ZigZagPivot

__all__ = [
    "AVERAGE_WINDOW",
    "AdvancingLeg",
    "AdvancingLegsPattern",
    "BarGap",
    "BarGapPattern",
    "BarMark",
    "BarsPattern",
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
    "Line",
    "LineEnd",
    "LineRelation",
    "LineRelationsPattern",
    "MarkType",
    "NO_LINES",
    "NestedLegs",
    "NestedLegsPattern",
    "PbMark",
    "PinnedLines",
    "RelationKind",
    "Side",
    "SimpleLegPattern",
    "TrendLine",
    "TrendLinesPattern",
    "Wick",
    "ZigZagIndidicator",
    "ZigZagPattern",
    "ZigZagPivot",
    "adjacent",
    "advancing_legs",
    "alike",
    "bar_gaps",
    "bar_positions",
    "breaks_out",
    "clear",
    "dominates",
    "expands",
    "extreme_points",
    "general_direction",
    "implied_body_min",
    "leg_ends",
    "line_relations",
    "marked_bars",
    "nested_legs",
    "nests",
    "position_of",
    "reverses",
    "side_of",
    "split_leg_windows",
    "split_legs",
    "touches",
    "trend_lines",
    "trim_tail",
]
