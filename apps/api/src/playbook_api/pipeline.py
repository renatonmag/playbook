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
the Forma rule replaced, without a second hand-maintained copy of the tuple drifting from this
one.

What it takes as arguments is decided by one test, and not by convenience: a caller may hand in
what the browser cannot evaluate for itself and what is not detector tuning. `depth`, `ahead`,
`k`, `similarity` and `expansion` fail it and stay written below, because they are what someone
tuning the *detector* comes looking for. Three things pass. The **Forma rule**, which the screen
can edit but only the engine can apply — see the module docstring on `routers/patterns.py`. And
the **lines somebody drew** — the levels and the sloped ones alike — which are the stronger
case of the two: a pinned line exists nowhere but in the browser holding it, so no argument about
where it is better computed arises. A pinned trend line is not the weaker version of that argument
it might look like. The fan this Pattern's cousin draws is hundreds of lines wide, and which two or
three of them somebody kept, and where they dragged an end to, is exactly the thing no Series can
say.

The third is the **proximity rule**, and it passes on the Forma rule's argument rather than on its
precedent. How near a bar has to get to a line before the near miss is worth reporting is a
fraction of the leg that bar sits in, and the leg is the zigzag's — a Series this server computes
and the browser receives only as Points, without the window of bars behind it or the extremes it
would have to re-derive. So the numbers travel and the arithmetic stays here, exactly as the Forma
thresholds do.

None of the three changes the shape of the pipeline, and that is the line being held.
"""

from pattern_engine import FormaRule, Pattern, Timeframe
from pattern_engine.patterns import (
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    NO_LINES,
    NO_PROXIMITY,
    NO_TRENDS,
    AdvancingLegsPattern,
    AverageRelationsPattern,
    AverageRespectPattern,
    AverageTargetPattern,
    BarGapPattern,
    BarsPattern,
    ConsecutiveDirectionPattern,
    GeneralDirectionPattern,
    LegBreaksPattern,
    LegExtremesPattern,
    LegPattern,
    LegReachPattern,
    LegRecapPattern,
    LegTargetPattern,
    LegWindowPattern,
    LineRelationsPattern,
    LineRespectPattern,
    NestedLegsPattern,
    PinnedLines,
    PinnedTrends,
    PivotOffsetPattern,
    ProximityRule,
    RetracementPattern,
    SimpleLegPattern,
    SmallestWindow,
    TrendLinesPattern,
    TrendRelationsPattern,
    WeightedAveragePattern,
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


#: How far back the smallest-bar reading looks by default.
#:
#: Ten, which is `AVERAGE_WINDOW`'s number and deliberately not `AVERAGE_WINDOW` itself: both carry
#: a sense of "recently" and they are different questions — that one is a mean the pair filter
#: compares against, this one is a window a bar is ranked inside. Tying them would make a change to
#: either read as a change to both.
#:
#: It is also `build_pipeline`'s default, and the number the route falls back to — see
#: `routers/patterns.py`.
DEFAULT_SMALLEST = SmallestWindow(bars=10)


def build_pipeline(
    rule: FormaRule = RULE_K,
    smallest: SmallestWindow = DEFAULT_SMALLEST,
    lines: PinnedLines = NO_LINES,
    trends: PinnedTrends = NO_TRENDS,
    proximity: ProximityRule = NO_PROXIMITY,
) -> tuple[Pattern, ...]:
    """The Patterns this installation runs, in run order, reading the rules and the lines where asked.

    One Pattern reads the Forma rule today — `bars` — and the argument is still one rule for the pipeline
    rather than one per Pattern. That is deliberate and outlives the current list: the reversal
    filters are the same three questions however they are asked, so a second Series that asks
    them differently gets the rule the first one got. Letting the browser tune two readings apart
    would make any comparison between them meaningless before it was drawn.

    The detectors are bound to local names rather than declared inline because the slicers below
    take the detector *instance*, not its producer key — one source of truth for a key that is
    derived, not written. Locals rather than module globals so that two calls never share a
    Pattern object: nothing today would notice, but the moment a second argument lands, a shared
    zigzag between the "old" and "new" pipelines is a bug nobody would look for.

    The `proximity` rule goes to **all four** relation Patterns and is one ladder for the pipeline,
    the same trade `rule` makes and for a sharper version of the same reason: a level, a sloped line
    and a moving average are asked the same four questions, and letting the browser tune "how near
    is near" differently between them would make the one comparison somebody reads two of those
    Series side by side for meaningless. It gains no new parameter for the averages — the ladder a
    body sets is set for them too, and `average-respect` folds those `close` events into its
    stretches exactly as `line-respect` does.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    # Reads the same bars as the zigzag above, deliberately: the two are alternative answers to
    # "where did this leg end", and running them on one window is what lets the monitor show the
    # difference. Expect this one to mark several times more often — it has no smoothing.
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    # Each detector's pivots repriced at the extremes their legs actually reached. Bound to
    # locals because the two retracements below take the instance, not the key — and one per
    # detector rather than one shared, since a reach belongs to the legs it was cut from.
    zigzag_reach = LegReachPattern(source=zigzag, reads=("5m",), emits="5m")
    simple_reach = LegReachPattern(source=simple_leg, reads=("5m",), emits="5m")
    # Both retracements, bound for the reason every local here is bound: the Pattern at the bottom
    # that reads a leg's breaks takes the zigzag's instance, and the recap at the very bottom takes
    # the simple legs' — one row per leg, and this is the Series that says how much each gave back.
    zigzag_retracement = RetracementPattern(source=zigzag_reach, reads=("5m",), emits="5m")
    simple_retracement = RetracementPattern(source=simple_reach, reads=("5m",), emits="5m")
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    # Bound to a local for the same reason the detectors above are: the grouper at the bottom
    # takes this slicer's *instance*, not its producer key.
    simple_legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")
    # And the zigzag's own slicer, bound for the same reason the others are — the two relation
    # Patterns at the bottom measure a near miss against the leg a bar sits in, and take this
    # instance rather than its key.
    legs = LegPattern(source=zigzag, reads=("5m",), emits="5m")
    # Bound for the same reason again: the filter at the very bottom takes this grouper's
    # instance, not its producer key.
    nested = NestedLegsPattern(source=leg_windows, legs=simple_legs, reads=("5m",), emits="5m")
    # Bound for the same reason once more: the second `leg-extremes` at the bottom measures these
    # legs, and takes this filter's instance.
    advancing = AdvancingLegsPattern(
        source=nested, pivots=zigzag, marks=simple_leg, reads=("5m",), emits="5m"
    )
    # And once more, for the one Pattern here that is told its geometry: the grouper at the very
    # bottom reads this Series' events, and takes this instance rather than its key.
    relations = LineRelationsPattern(
        lines=lines, proximity=proximity, legs=legs, reads=("5m",), emits="5m"
    )
    # Its sloped twin, bound for the same reason: the second `line-respect` at the very bottom reads
    # this Series' events and takes this instance. Beside `relations` rather than near
    # `trend-lines`, because it is not downstream of the fan — see `TrendRelationsPattern`.
    trend_relations = TrendRelationsPattern(
        trends=trends, proximity=proximity, legs=legs, reads=("5m",), emits="5m"
    )
    # The two readings of those events, bound for the reason everything else here is bound: the two
    # `leg-target` instances at the very bottom each take one of these *instances*, not its key.
    level_respects = LineRespectPattern(source=relations, reads=("5m",), emits="5m")
    trend_respects = LineRespectPattern(source=trend_relations, reads=("5m",), emits="5m")
    # The targets against each kind of line, bound because the recap at the very bottom takes all
    # four instances and keeps them apart on its row. Four Patterns rather than one reading every
    # respect Series — the reason the respects themselves are four, restated at the tuple site below.
    level_targets = LegTargetPattern(
        source=simple_legs, marks=simple_leg, respects=level_respects, reads=("5m",), emits="5m"
    )
    trend_targets = LegTargetPattern(
        source=simple_legs, marks=simple_leg, respects=trend_respects, reads=("5m",), emits="5m"
    )
    # The two averages this installation watches, and the same four questions asked of each. Bound
    # for the reason every local here is bound: the relations Patterns take the average's *instance*
    # and the respects take theirs.
    #
    # An average is a Pattern here at all because a *Pattern asks questions of it* — the argument is
    # in `weighted_average`'s docstring, against the paragraph in `apps/web/app/utils/indicator.ts`
    # that says an indicator belongs in the browser. The line on the chart is still drawn there.
    #
    # The periods are **not** parameters, and they fail this module's one test in the most decisive
    # way available: an average is arithmetic over closes this server already holds, so unlike a
    # pinned line or a proximity ladder there is nothing here the browser knows that this does not.
    # Somebody who wants a different period edits this line.
    #
    # Thirty twice, and the two are not one setting said twice. Thirty five-minute bars is two and a
    # half hours — and it is `DEFAULTS.period` in `useStoredIndicators.ts`, the line the monitor
    # draws before anybody touches a dial, which is what makes the two comparable by eye. Thirty
    # hourly buckets is three sessions, and costs the first three of the nine a default window holds:
    # that Series says nothing until it has thirty closed hours behind it.
    average = WeightedAveragePattern(period=30, bucket=None, reads=("5m",), emits="5m")
    hourly_average = WeightedAveragePattern(period=30, bucket="1h", reads=("5m",), emits="5m")
    average_relations = AverageRelationsPattern(
        source=average, proximity=proximity, legs=legs, reads=("5m",), emits="5m"
    )
    hourly_relations = AverageRelationsPattern(
        source=hourly_average, proximity=proximity, legs=legs, reads=("5m",), emits="5m"
    )
    # And their respect groups, bound where they used to sit inline: the two targets below take the
    # instances. `AverageRespectPattern` is `LineRespectPattern` under a name of its own and
    # `AverageTargetPattern` is `LegTargetPattern` under one — the same cut for the same reason, one
    # step apart on one chain, argued in full in `average_respect.py` and transposed in
    # `average_target.py`. Both matter here and nowhere else: the web app keys "is this Series only
    # ever filled by a `POST`" off the class part of a producer, and neither of these is downstream
    # of anything a person drew.
    average_respects = AverageRespectPattern(source=average_relations, reads=("5m",), emits="5m")
    hourly_respects = AverageRespectPattern(source=hourly_relations, reads=("5m",), emits="5m")
    average_targets = AverageTargetPattern(
        source=simple_legs, marks=simple_leg, respects=average_respects, reads=("5m",), emits="5m"
    )
    hourly_targets = AverageTargetPattern(
        source=simple_legs, marks=simple_leg, respects=hourly_respects, reads=("5m",), emits="5m"
    )

    return (
        zigzag,
        simple_leg,
        # The most elementary thing a pivot Series says once there are two legs in it: how much of
        # the move before it each leg gave back. It sits here, above `general-direction`, because
        # that one is introduced below as the first opinion that *outlives* a leg and this one does
        # not — it is one leg measured against what came before it, and nothing more.
        #
        # Both instances together, unlike the two `leg-extremes` and the two `line-respect`, which
        # had to split: those pairs' sources sit far apart in this tuple, and each instance has to
        # follow its own. Here both detectors are the two entries above, so the only ordering
        # constraint is already satisfied for both.
        #
        # Two single-source instances and no third that reads both, and that is not a convenience:
        # it is where "simple legs are measured against simple legs and the zigzag against the
        # zigzag" is enforced. A Pattern taking both Series could mix them and nothing downstream
        # would be able to tell that it had.
        #
        # Neither reads its detector directly, and that is the whole of what `leg-reach` is doing
        # in this tuple. A detector's pivot is not its leg's extreme — `simple-leg` prices a mark
        # on the *marked* bar, which can sit several bars past the turn, and the zigzag elects a
        # vertex only among bars that made a rolling-window extreme. A fraction taken between four
        # such prices is short by whatever each detector left on the table, which on the simple
        # legs is most of them. The reach Patterns above run through the bars and hand over one
        # Point per pivot, in the same order, priced where the leg really got to.
        #
        # No dials: the loaded window is the whole of the lookback, and the fraction has no
        # threshold to tune.
        zigzag_reach,
        simple_reach,
        zigzag_retracement,
        simple_retracement,
        # The first opinion that outlives a leg: the market's general lean, read off the simple
        # legs' pivots and guarded by the zigzag's. It reads the two Series above, never the
        # bars, so it must sit after both — declaration order is run order.
        GeneralDirectionPattern(source=simple_leg, pivots=zigzag, reads=("5m",), emits="5m"),
        # The other thing to ask of those same two Series, and the cheapest: at the right edge of
        # the window, has the simple leg's mark got *past* the zigzag's vertex? One Point, never
        # more — this reads the newest pair and nothing behind it, so the history of past offsets
        # is not in here. The newest mark is skipped while it is provisional, or the answer would
        # track the clock rather than the market. After both sources, like the Pattern above it,
        # and for the same reason. No dials.
        PivotOffsetPattern(source=simple_leg, pivots=zigzag, reads=("5m",), emits="5m"),
        # The other thing the simple legs' pivots say once you stop reading them one leg at a
        # time: the straight lines they can be joined by. Tops to tops and bottoms to bottoms,
        # kept only where no candle in between reaches through the line. It needs the bars as well
        # as the Series — a collision is a fact about the candles, not about the pivots — so it
        # sits here, after its source and among the Patterns that still look at raw price.
        #
        # No dials. What counts as a collision (a *body* past the line — a wick through it is not
        # one) and which side a pivot is are both settled in the module, and how many lines to keep is not a decision a detector
        # gets to make. Expect this to be by far the heaviest Series the pipeline emits: every
        # pivot fans out to every later one it can see, which is the point and is stated in full
        # in the module docstring.
        TrendLinesPattern(source=simple_leg, reads=("5m",), emits="5m"),
        # No source and no ordering constraint: a gap is a property of three adjacent bars, not of
        # a leg somebody cut, so this one reads `ctx["bars"]` and could sit anywhere in the tuple.
        # It is here because it answers about the raw bars, like the two detectors above it, and
        # everything below reads a Series rather than the bars.
        BarGapPattern(reads=("5m",), emits="5m"),
        # And the other thing three adjacent bars can say, on the same terms: three closes the
        # same way. It answers `general-direction`'s question — which way is this leaning — off
        # nothing but the bodies in front of it, which is why it sits here beside the other
        # bars-only Pattern rather than beside the one it argues with. No source, so no ordering
        # constraint: it reads `ctx["bars"]` and could be declared anywhere in this tuple.
        #
        # No dials either. `SPAN` is three because the rule is the three-bar rule, and a run is
        # reported once, when it reaches three — see the module docstring, which states what that
        # costs: a run of thirty is indistinguishable here from an exact triple.
        ConsecutiveDirectionPattern(reads=("5m",), emits="5m"),
        # And the two averages, which belong in this block for the same reason the two above do:
        # they read `ctx["bars"]` and nothing else, so they carry no ordering constraint and could
        # be declared anywhere. What sits below them does have one — see the four relation Series
        # near the bottom, which take these instances.
        #
        # Dense output, unlike everything else in this tuple: one Point per bar past the warm-up,
        # around 970 on a default window each. That is the price of the questions asked of them
        # further down, and it is paid on every run whether or not anybody reads the average itself.
        average,
        hourly_average,
        # One slicer per detector, so the comparison the two detectors exist for survives the
        # step from vertices to bars. Both must come after their source: declaration order is
        # run order, and a slicer ahead of its detector reads a key that is not in `ctx` yet.
        legs,
        simple_legs,
        # The same legs again, each carrying the five bars that follow its close. A record bar or
        # a reversal pair can land just *past* the turn, in the opening bars of the next leg,
        # where a `LegPattern` leg cannot see it. Only the zigzag gets one: this is the smoothed
        # answer, and a second copy on `simple_leg` doubles the heaviest payload on the wire to
        # answer a question nothing is asking yet.
        leg_windows,
        # And the first look *inside* the bars: which of them the three reversal filters mark.
        # Every bar in the window, asked for both turns — there is no leg narrowing the history
        # first and no single direction to filter for, so a bar is judged for a bullish turn and
        # a bearish one alike. `reversal_filters` is the one copy of that arithmetic.
        #
        # It reads the bars alone, so it has no ordering constraint and could sit anywhere below
        # the detectors. `k`, `similarity` and `expansion` are the dials that stay here, at the
        # pipeline site, for the same reason `ahead` and `depth` are: they are what someone
        # tuning the detector will come looking for. `rule` and `smallest` are the two that left,
        # because the screen can edit them and only the engine can evaluate them.
        BarsPattern(
            rule=rule,
            k=DEFAULT_K,
            similarity=DEFAULT_SIMILARITY,
            expansion=DEFAULT_EXPANSION,
            smallest=smallest,
            reads=("5m",),
            emits="5m",
        ),
        # And the other question about those same bars: not which of them could be the turn, but
        # how far the leg got. Three answers per leg — the extreme it reached, the extreme it
        # closed at, and the level it held throughout — which are usually three different bars.
        # Two sources, because a `LegWindow` anchors on its opening vertex and does not say which
        # extreme its close is — and which end of the move to measure from is exactly that. No
        # dials of its own: an extreme is an extreme, and how far past the close to look is
        # `ahead`, set once above.
        # Reports **closed legs only** — the newest leg's vertex is still provisional, so it is
        # skipped, and this Series runs one Point behind `leg-windows`. Not a dial either.
        LegExtremesPattern(source=leg_windows, pivots=zigzag, reads=("5m",), emits="5m"),
        # And the first Pattern that *joins* the two detectors rather than running them side by
        # side: for each zigzag leg, the simple legs that started inside it. Grouped by where a
        # simple leg starts, and bounded by the closing vertex rather than by the end of the
        # window — the `ahead` tail belongs to the leg that follows. No dials: the grouping is one
        # comparison, and both sources are already tuned above.
        nested,
        # And the first Pattern that reads a leg *against the ones before it*: what this zigzag leg
        # broke of the earlier swing highs or lows, how many simple legs ran inside it, and how
        # much of the prior move it gave back. Three Series joined on one Point, and the only one
        # here that reads all three — which is the whole of what it adds, since no price in it is
        # new. Its breaks are counted off `leg-reach` and never off the detector, for the reason
        # that module opens with.
        #
        # After `nested` because it reads it, and after both `zigzag_reach` and `zigzag_retracement`
        # further up for the same reason. No dials: every comparison is settled in the module, and
        # the lookback is the loaded window.
        LegBreaksPattern(
            source=nested,
            reaches=zigzag_reach,
            measures=zigzag_retracement,
            reads=("5m",),
            emits="5m",
        ),
        # And the filter over that grouping: inside each zigzag leg, every pullback, plus the
        # pushes that actually made a new extreme. A push that got nowhere is the only thing
        # dropped, and the output is flat — one list of legs, not a list of groups.
        #
        # Three sources, because the two directions the rule needs come from two different
        # detectors: the *group's* is the zigzag's closing vertex, and each *leg's own* is the
        # simple-leg mark it opens on. A `Leg` records neither. No dials — what counts as a new
        # extreme (the leg's last bar), how strict the comparison is, and what the running extreme
        # starts at are all settled in the module, not tuned here.
        advancing,
        # And the same three questions asked of *those* legs: how far each one reached, closed and
        # held. The same Pattern that measures the zigzag's legs further up, over a different
        # source — which is the whole of why a producer key carries its sources whole, and why the
        # two Series are told apart on screen by the name each instance gives itself.
        #
        # No `pivots`, and that is not an omission: an `AdvancingLeg` already carries its own
        # direction, read upstream off the mark it opens on. The second source exists only for a
        # `LegWindow`, which anchors on its opening vertex and cannot say which extreme its close
        # is. Last in the tuple because declaration order is run order.
        LegExtremesPattern(source=advancing, reads=("5m",), emits="5m"),
        # Then the two that answer about a person's question rather than about the market. The
        # first is the only Pattern here that is *told* where to look: every one above finds its
        # own levels, and this one is handed the lines a person pinned on the monitor and reports what
        # the bars since have done about them — touched, come near without touching, broken through,
        # or crossed and crossed back. It sits here by meaning — everything above answers about the
        # market, and this answers about the market *and a person's question* — and now by necessity
        # too: the near-miss question is scaled by the leg a bar sits in, so it reads `legs` above
        # and would raise on a key that is not in `ctx` yet if it were declared any earlier.
        #
        # With no lines it emits an empty Series rather than being left out of the tuple, so the
        # `ctx` key exists on every run and "nobody drew a line" is not indistinguishable from a
        # Pattern that failed.
        relations,
        # The reading of the one above rather than a second look at the market: `line-relations`
        # answers a bar at a time, and this folds those events into the stretches over which a line
        # held. A second Pattern and not a fourth `kind` there, because `LineRelation.side` means
        # "where the bar opened" on every one of its kinds and a group's side cannot — see that
        # module's docstring, and this one's.
        #
        # Immediately after its source, and this one *is* an ordering constraint: it reads a
        # producer key rather than `ctx["bars"]`, so declared before `relations` it would raise.
        level_respects,
        # The same pair again for the lines that slope. A pinned trend line asks what a pinned level
        # asks — is price still respecting this? — and gets the same three answers under the same
        # three names, because they are the same rules read off a price that moves with the bar.
        #
        # Two instances of `LineRespectPattern` and not a second class: it reads `LineRelation`
        # fields and never the lines, so it cannot tell the two sources apart and has no reason to.
        # They are distinct in `ctx` because `producer` renders the source into the key, and
        # distinct on the screen because `name` is derived from the source's.
        trend_relations,
        trend_respects,
        # And the same pair twice more, for the two lines nobody drew. An average has a price on
        # every bar exactly as a level and a sloped line do, so the four questions are the four
        # questions — `AverageRelationsPattern` reuses the driver rather than restating the rules,
        # and `line-respect` reads its events without being told what drew the line.
        #
        # Which makes these the third and fourth Patterns here to ask them, and the first two that
        # are *not* told their geometry: the levels and the trend lines above are a person's input
        # and cannot be re-derived, while these lines are Series this pipeline computed four entries
        # up. So they are in the tuple on every run with nothing to wait for, and an empty Series
        # from one of them means the window was too short for the period rather than that nobody
        # asked.
        #
        # Two ordering constraints each, both satisfied here: after their average, and after `legs`
        # for the near miss. `AverageRespectPattern` is `LineRespectPattern` under a name of its
        # own, and the name is the whole of the subclass — `apps/web/app/utils/manual-series.ts`
        # keys "is this Series only ever filled by a `POST`" off the producer's class part, and
        # `line-respect` is in that set because both of the instances above are downstream of the
        # pinned lines. These two are not, so they must not answer to that name.
        average_relations,
        hourly_relations,
        average_respects,
        hourly_respects,
        # And the last thing to ask once both halves are on the table: where the legs and the lines
        # *met*. Everything above answers about one or the other — how far a leg got, which lines are
        # holding — and this is the join: each closed simple leg's extreme, where that bar sits
        # inside a stretch one line held from the side that would have stopped it.
        #
        # Down here because declaration order is run order and it reads three keys, the furthest
        # down of them the two respects immediately above. Two instances rather than one Pattern
        # reading both, the reason the two `LineRespectPattern`s give: a target against a level and
        # a target against a sloped line are the same reading of different lines, and a Pattern
        # taking both Series could mix them with nothing downstream able to tell. The recap below
        # keeps them in two fields for exactly that reason.
        #
        # No dials. Which side agrees is settled in the module, the extreme is `reach`, and the
        # detector's tuning is set once above.
        level_targets,
        trend_targets,
        # And the same join against the two averages, which is the same reading of a line nobody
        # drew — `leg_targets` asks a respect group about a leg's extreme and never asks what drew
        # the line, exactly as `line_respects` never asks. What differs is only the producer name,
        # and only because it has to: `leg-target` is in the web app's `MANUAL` and these two must
        # not be, since their whole chain is computed from closes on every run. The argument is
        # `average_target.py`'s, and it is `average_respect.py`'s one step up the same chain.
        average_targets,
        hourly_targets,
        # And then the row the monitor's panel reads: one Point per simple leg of the newest day,
        # carrying the leg, how far it reached, what it retraced, and the lines it ran into — the
        # two Series immediately above, split by which kind of line they are about.
        #
        # Last in the tuple, and by the widest margin of anything here: four keys, the furthest down
        # of them declared on the line before. It is also the only Pattern in this pipeline that
        # answers about *part* of the window, which is the point — a phrase about the session reads
        # one Series and does no arithmetic, and that is what "align it in the backend" means.
        #
        # The alignment it leans on is a fact about these particular declarations, not a guarantee:
        # `simple_retracement` measures the legs of `simple_legs` only because both were built off
        # `simple_leg` above. A retracement over the zigzag would have the same shape, pass the
        # count guard, and be wrong on every row.
        #
        # No dials. Nothing here measures anything — every number arrived from one of the four.
        LegRecapPattern(
            source=simple_legs,
            measures=simple_retracement,
            levels=level_targets,
            trends=trend_targets,
            averages=average_targets,
            hourly_averages=hourly_targets,
            reads=("5m",),
            emits="5m",
        ),
    )


#: This installation's pipeline: `build_pipeline` at its declared defaults. The object a tick
#: worker imports, and the object `/patterns` runs when no rule override arrives — the same one,
#: not an equal one, so "no parameters" and "as before" are the same statement.
PIPELINE: tuple[Pattern, ...] = build_pipeline()


def timeframes(pipeline: tuple[Pattern, ...] = PIPELINE) -> set[Timeframe]:
    """Every Timeframe `pipeline` reads — the Candles a run has to be handed.

    Takes the pipeline rather than reading the module global. Today that is provably a no-op: the
    only things `build_pipeline` varies are a `FormaRule` and a set of lines, neither of which
    can change any Pattern's `reads`. It is written this way anyway, because the alternative is a function that answers
    about one tuple while the caller runs another — the exact "both appearing to work" failure
    the module docstring above is written against.
    """
    return {timeframe for pattern in pipeline for timeframe in pattern.reads}
