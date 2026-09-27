"""The Patterns themselves. The engine imports none of these — a pipeline names them."""

from .advancing_legs import AdvancingLeg, AdvancingLegsPattern, advancing_legs, trim_tail
# `resolver` and `label` stay behind, deliberately. `trend_relations` already exports a
# `resolver` and `average_relations` has one of its own; two of that name in one flat namespace
# is the silent shadowing this file's ordering exists to prevent, and `label` and `MIN_PERIOD`
# in `weighted_average` are generic enough to invite the same collision later. All four are
# reachable on their own modules, which is how the tests import them.
from .average_relations import AverageRelationsPattern, average_relations, values_at
from .average_respect import AverageRespectPattern
from .average_target import AverageTargetPattern
from .bar_gap import BarGap, BarGapPattern, bar_gaps
from .bars import BarMark, BarsPattern, SmallestWindow
from .consecutive_direction import (
    ConsecutiveDirection,
    ConsecutiveDirectionPattern,
    consecutive_direction,
)
from .general_direction import GeneralDirection, GeneralDirectionPattern, general_direction
from .leg_breaks import LegBreak, LegBreaksPattern, taken_levels
from .leg_extremes import (
    ExtremeType,
    LegExtremes,
    LegExtremesPattern,
    LegPoint,
    extreme_points,
)
from .leg_processor import Leg, LegPattern, bar_positions, position_of, split_legs
from .leg_reach import LegReach, LegReachPattern, SidedPivot, leg_reaches
from .leg_recap import LegRecap, LegRecapPattern, leg_recaps
from .leg_reversals import LegBar, LegReversals, LegReversalsPattern, marked_bars
from .leg_target import AGREES, LegTarget, LegTargetPattern, leg_targets
from .leg_window import LegWindow, LegWindowPattern, split_leg_windows
from .line_relations import (
    NO_LINES,
    OPPOSITE,
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    PriceAt,
    RelationKind,
    Side,
    Wick,
    breaks_out,
    constantly,
    leg_spans,
    line_relations,
    nears,
    relations_of,
    side_of,
    spans_from,
    touches,
)
from .line_respect import (
    LineRespect,
    LineRespectPattern,
    line_respects,
    respected_side,
    undone_breakouts,
)
from .nested_legs import NestedLegs, NestedLegsPattern, nested_legs
from .pivot_offset import PivotOffset, PivotOffsetPattern, pivot_offset
from .proximity import NO_PROXIMITY, ProximityLevel, ProximityRule, reach
from .retracement import RetracedMove, Retracement, RetracementPattern, retracements
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
    engulfs,
    expands,
    implied_body_min,
    leans,
    nests,
    reverses,
    smallest,
)
from .simple_leg import LegMark, PbMark, SimpleLegPattern
from .trend_lines import LineEnd, TrendLine, TrendLinesPattern, clear, leg_ends, trend_lines
from .trend_relations import (
    NO_TRENDS,
    PinnedTrend,
    PinnedTrends,
    TrendRelationsPattern,
    price_at,
    resolver,
    trend_relations,
)
from .weighted_average import WeightedAverage, WeightedAveragePattern, weighted_average
from .zigzag import ZigZagIndidicator, ZigZagPattern, ZigZagPivot

__all__ = [
    "AGREES",
    "AVERAGE_WINDOW",
    "AdvancingLeg",
    "AdvancingLegsPattern",
    "AverageRelationsPattern",
    "AverageRespectPattern",
    "AverageTargetPattern",
    "BarGap",
    "BarGapPattern",
    "BarMark",
    "BarsPattern",
    "ConsecutiveDirection",
    "ConsecutiveDirectionPattern",
    "DEFAULT_EXPANSION",
    "DEFAULT_K",
    "DEFAULT_SIMILARITY",
    "ExtremeType",
    "GeneralDirection",
    "GeneralDirectionPattern",
    "Leg",
    "LegBar",
    "LegBreak",
    "LegBreaksPattern",
    "LegExtremes",
    "LegExtremesPattern",
    "LegMark",
    "LegPattern",
    "LegPoint",
    "LegReach",
    "LegReachPattern",
    "LegRecap",
    "LegRecapPattern",
    "LegReversals",
    "LegReversalsPattern",
    "LegTarget",
    "LegTargetPattern",
    "LegWindow",
    "LegWindowPattern",
    "Line",
    "LineEnd",
    "LineRelation",
    "LineRelationsPattern",
    "LineRespect",
    "LineRespectPattern",
    "MarkType",
    "NO_LINES",
    "NO_PROXIMITY",
    "NO_TRENDS",
    "NestedLegs",
    "NestedLegsPattern",
    "OPPOSITE",
    "PbMark",
    "PinnedLines",
    "PinnedTrend",
    "PinnedTrends",
    "PivotOffset",
    "PivotOffsetPattern",
    "PriceAt",
    "ProximityLevel",
    "ProximityRule",
    "RelationKind",
    "RetracedMove",
    "Retracement",
    "RetracementPattern",
    "Side",
    "SidedPivot",
    "SimpleLegPattern",
    "SmallestWindow",
    "TrendLine",
    "TrendLinesPattern",
    "TrendRelationsPattern",
    "WeightedAverage",
    "WeightedAveragePattern",
    "Wick",
    "ZigZagIndidicator",
    "ZigZagPattern",
    "ZigZagPivot",
    "adjacent",
    "advancing_legs",
    "alike",
    "average_relations",
    "bar_gaps",
    "bar_positions",
    "breaks_out",
    "clear",
    "consecutive_direction",
    "constantly",
    "dominates",
    "engulfs",
    "expands",
    "extreme_points",
    "general_direction",
    "implied_body_min",
    "leans",
    "leg_ends",
    "leg_reaches",
    "leg_recaps",
    "leg_spans",
    "leg_targets",
    "line_relations",
    "line_respects",
    "marked_bars",
    "nears",
    "nested_legs",
    "nests",
    "pivot_offset",
    "position_of",
    "price_at",
    "reach",
    "relations_of",
    "resolver",
    "respected_side",
    "retracements",
    "reverses",
    "side_of",
    "smallest",
    "spans_from",
    "split_leg_windows",
    "split_legs",
    "taken_levels",
    "touches",
    "trend_lines",
    "trend_relations",
    "trim_tail",
    "undone_breakouts",
    "values_at",
    "weighted_average",
]
