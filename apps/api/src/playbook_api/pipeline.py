"""What this installation detects: the Patterns, in order, and the Instrument they run on.

Declared by hand, as `PatternEngine` requires — there is no scheduling and no dependency graph,
so declaration order is run order. This lives in the API app rather than in `pattern_engine`
because *which* Patterns an installation runs is a deployment decision, and the engine
deliberately knows nothing about deployment.

It is a module rather than a constant inside the route so that a tick worker, when one exists,
can import the same list. A screen that validates one pipeline while the tick runs another
would diverge in silence, with both appearing to work.
"""

from pattern_engine import FormaRule, Pattern, Timeframe
from pattern_engine.patterns import (
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    LegPattern,
    LegReversalsPattern,
    LegWindowPattern,
    SimpleLegPattern,
    ZigZagPattern,
)

#: The only ticker the database is known to hold. Becomes a parameter when a second one lands.
SYMBOL = "WIN@N"

_zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
# Reads the same bars as the zigzag above, deliberately: the two are alternative answers to
# "where did this leg end", and running them on one window is what lets the monitor show the
# difference. Expect this one to mark several times more often — it has no smoothing.
_simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
_leg_windows = LegWindowPattern(source=_zigzag, ahead=5, reads=("5m",), emits="5m")

#: The Forma rule the bench on `/rules` currently favours, copied from `docs/forma/rules.json`.
#:
#: Declared here rather than read from that file: it is hand-edited documentation, and making
#: it a runtime dependency of the pipeline turns a typo there into a pipeline that will not
#: assemble. The cost is that the numbers now live in two places and nothing compares them.
#:
#: Its `direction` is deliberately not carried. In the bench a rule studies one side at a time;
#: here the side is the leg's — a leg closing on a low wants a bullish bar, one closing on a
#: high wants a bearish one — so `FormaRule` has no such field and `marks` takes it as an
#: argument. The same seven numbers serve both sides.
RULE_K = FormaRule(
    name="K",
    require_wf_over_wc=True,
    wf_min=0.49,
    wc_max=1.0,
    wc_max_ratio=None,
    body_min=0.0,
    body_max=0.35,
    colour="nunca",
    colour_body_min=1.0,
)

# Bound to names rather than declared inline because the slicers below take the detector
# *instance*, not its producer key — one source of truth for a key that is derived, not written.
PIPELINE: tuple[Pattern, ...] = (
    _zigzag,
    _simple_leg,
    # One slicer per detector, so the comparison the two detectors exist for survives the step
    # from vertices to bars. Both must come after their source: declaration order is run order,
    # and a slicer ahead of its detector reads a key that is not in `ctx` yet.
    LegPattern(source=_zigzag, reads=("5m",), emits="5m"),
    LegPattern(source=_simple_leg, reads=("5m",), emits="5m"),
    # The same legs again, each carrying the five bars that follow its close. A record bar or a
    # reversal pair can land just *past* the turn, in the opening bars of the next leg, where a
    # `LegPattern` leg cannot see it. Only the zigzag gets one: this is the smoothed answer, and
    # a second copy on `_simple_leg` doubles the heaviest payload on the wire to answer a
    # question nothing is asking yet.
    _leg_windows,
    # And the first look *inside* those bars: which of them either reversal filter marks. Two
    # sources, because a `LegWindow` anchors on its opening vertex and does not say which
    # extreme its close is — and the direction to filter for is exactly that. The dials are
    # here, at the pipeline site, for the same reason `ahead` and `depth` are: they are what
    # someone tuning the rule will come looking for.
    LegReversalsPattern(
        source=_leg_windows,
        pivots=_zigzag,
        rule=RULE_K,
        k=DEFAULT_K,
        similarity=DEFAULT_SIMILARITY,
        expansion=DEFAULT_EXPANSION,
        reads=("5m",),
        emits="5m",
    ),
)


def timeframes() -> set[Timeframe]:
    """Every Timeframe the pipeline reads — the Candles a run has to be handed."""
    return {timeframe for pattern in PIPELINE for timeframe in pattern.reads}
