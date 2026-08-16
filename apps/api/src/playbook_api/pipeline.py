"""What this installation detects: the Patterns, in order, and the Instrument they run on.

Declared by hand, as `PatternEngine` requires — there is no scheduling and no dependency graph,
so declaration order is run order. This lives in the API app rather than in `pattern_engine`
because *which* Patterns an installation runs is a deployment decision, and the engine
deliberately knows nothing about deployment.

It is a module rather than a constant inside the route so that a tick worker, when one exists,
can import the same list. A screen that validates one pipeline while the tick runs another
would diverge in silence, with both appearing to work.
"""

from pattern_engine import Pattern, Timeframe
from pattern_engine.patterns import LegPattern, SimpleLegPattern, ZigZagPattern

#: The only ticker the database is known to hold. Becomes a parameter when a second one lands.
SYMBOL = "WIN@N"

_zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
# Reads the same bars as the zigzag above, deliberately: the two are alternative answers to
# "where did this leg end", and running them on one window is what lets the monitor show the
# difference. Expect this one to mark several times more often — it has no smoothing.
_simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")

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
)


def timeframes() -> set[Timeframe]:
    """Every Timeframe the pipeline reads — the Candles a run has to be handed."""
    return {timeframe for pattern in PIPELINE for timeframe in pattern.reads}
