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
from pattern_engine.patterns import ZigZagPattern

#: The only ticker the database is known to hold. Becomes a parameter when a second one lands.
SYMBOL = "WIN@N"

PIPELINE: tuple[Pattern, ...] = (
    ZigZagPattern(depth=8, reads=("5m",), emits="5m"),
)


def timeframes() -> set[Timeframe]:
    """Every Timeframe the pipeline reads — the Candles a run has to be handed."""
    return {timeframe for pattern in PIPELINE for timeframe in pattern.reads}
