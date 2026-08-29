"""What this installation detects: the Patterns, in order, and the Instrument they run on.

Declared by hand, as `PatternEngine` requires — there is no scheduling and no dependency graph,
so declaration order is run order. This lives in the API app rather than in `pattern_engine`
because *which* Patterns an installation runs is a deployment decision, and the engine
deliberately knows nothing about deployment.

It is a module rather than a constant inside the route so that a tick worker, when one exists,
can import the same list. A screen that validates one pipeline while the tick runs another
would diverge in silence, with both appearing to work.

The list is produced by `build_pipeline`, and `PIPELINE` is that function at its declared
defaults. The importable-list property is unchanged: a tick worker imports `PIPELINE` and gets
what it always got. What the function buys is that `/patterns` can run this same pipeline with
one Pattern's Forma rule replaced, without a second hand-maintained copy of the tuple drifting
from this one. It takes exactly one argument, deliberately: `depth`, `ahead`, `k`, `similarity`
and `expansion` stay written below, because they are what someone tuning the *detector* comes
looking for, and only the Forma rule is a thing the browser can edit and cannot evaluate for
itself. See the module docstring on `routers/patterns.py` for why that one exception exists.
"""

from pattern_engine import FormaRule, Pattern, Timeframe
from pattern_engine.patterns import (
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    BarGapPattern,
    LegExtremesPattern,
    LegPattern,
    LegReversalsPattern,
    LegWindowPattern,
    NestedLegsPattern,
    SimpleLegPattern,
    ZigZagPattern,
)

#: The only ticker the database is known to hold. Becomes a parameter when a second one lands.
SYMBOL = "WIN@N"

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
#:
#: It is also `build_pipeline`'s default, and its *name* is what an override borrows — see
#: `rule_query.OVERRIDE_NAME`.
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


def build_pipeline(rule: FormaRule = RULE_K) -> tuple[Pattern, ...]:
    """The Patterns this installation runs, in run order, with `rule` applied to `leg-reversals`.

    The detectors are bound to local names rather than declared inline because the slicers below
    take the detector *instance*, not its producer key — one source of truth for a key that is
    derived, not written. Locals rather than module globals so that two calls never share a
    Pattern object: nothing today would notice, but the moment a second argument lands, a shared
    zigzag between the "old" and "new" pipelines is a bug nobody would look for.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    # Reads the same bars as the zigzag above, deliberately: the two are alternative answers to
    # "where did this leg end", and running them on one window is what lets the monitor show the
    # difference. Expect this one to mark several times more often — it has no smoothing.
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    # Bound to a local for the same reason the detectors above are: the grouper at the bottom
    # takes this slicer's *instance*, not its producer key.
    simple_legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")

    return (
        zigzag,
        simple_leg,
        # No source and no ordering constraint: a gap is a property of three adjacent bars, not of
        # a leg somebody cut, so this one reads `ctx["bars"]` and could sit anywhere in the tuple.
        # It is here because it answers about the raw bars, like the two detectors above it, and
        # everything below reads a Series rather than the bars.
        BarGapPattern(reads=("5m",), emits="5m"),
        # One slicer per detector, so the comparison the two detectors exist for survives the
        # step from vertices to bars. Both must come after their source: declaration order is
        # run order, and a slicer ahead of its detector reads a key that is not in `ctx` yet.
        LegPattern(source=zigzag, reads=("5m",), emits="5m"),
        simple_legs,
        # The same legs again, each carrying the five bars that follow its close. A record bar or
        # a reversal pair can land just *past* the turn, in the opening bars of the next leg,
        # where a `LegPattern` leg cannot see it. Only the zigzag gets one: this is the smoothed
        # answer, and a second copy on `simple_leg` doubles the heaviest payload on the wire to
        # answer a question nothing is asking yet.
        leg_windows,
        # And the first look *inside* those bars: which of them either reversal filter marks.
        # Two sources, because a `LegWindow` anchors on its opening vertex and does not say which
        # extreme its close is — and the direction to filter for is exactly that. `k`,
        # `similarity` and `expansion` are the dials that stay here, at the pipeline site, for
        # the same reason `ahead` and `depth` are: they are what someone tuning the detector will
        # come looking for. `rule` is the one that left, because the screen can edit it and only
        # the engine can evaluate it.
        LegReversalsPattern(
            source=leg_windows,
            pivots=zigzag,
            rule=rule,
            k=DEFAULT_K,
            similarity=DEFAULT_SIMILARITY,
            expansion=DEFAULT_EXPANSION,
            reads=("5m",),
            emits="5m",
        ),
        # And the other question about those same bars: not which of them could be the turn, but
        # how far the leg got. Three answers per leg — the extreme it reached, the extreme it
        # closed at, and the level it held throughout — which are usually three different bars.
        # Two sources for the same reason `leg-reversals` needs two, and no dials of its own: an
        # extreme is an extreme, and how far past the close to look is `ahead`, set once above.
        # Reports **closed legs only** — the newest leg's vertex is still provisional, so it is
        # skipped, and this Series runs one Point behind `leg-windows`. Not a dial either.
        LegExtremesPattern(source=leg_windows, pivots=zigzag, reads=("5m",), emits="5m"),
        # And the first Pattern that *joins* the two detectors rather than running them side by
        # side: for each zigzag leg, the simple legs that started inside it. Grouped by where a
        # simple leg starts, and bounded by the closing vertex rather than by the end of the
        # window — the `ahead` tail belongs to the leg that follows. No dials: the grouping is one
        # comparison, and both sources are already tuned above.
        NestedLegsPattern(source=leg_windows, legs=simple_legs, reads=("5m",), emits="5m"),
    )


#: This installation's pipeline: `build_pipeline` at its declared defaults. The object a tick
#: worker imports, and the object `/patterns` runs when no rule override arrives — the same one,
#: not an equal one, so "no parameters" and "as before" are the same statement.
PIPELINE: tuple[Pattern, ...] = build_pipeline()


def timeframes(pipeline: tuple[Pattern, ...] = PIPELINE) -> set[Timeframe]:
    """Every Timeframe `pipeline` reads — the Candles a run has to be handed.

    Takes the pipeline rather than reading the module global. Today that is provably a no-op: the
    only thing `build_pipeline` varies is a `FormaRule`, which cannot change any Pattern's
    `reads`. It is written this way anyway, because the alternative is a function that answers
    about one tuple while the caller runs another — the exact "both appearing to work" failure
    the module docstring above is written against.
    """
    return {timeframe for pattern in pipeline for timeframe in pattern.reads}
