"""The four questions `line_relations` asks of a level, asked of a moving average.

**The rules are not new, and that is the point** — the same move `trend_relations` makes, and this
is the third kind of line to make it. Touch, close, breakout and seam are `line_relations`' four,
unchanged; the loop that applies them is literally the same code, `relations_of`; the Points are
`LineRelation`s. Nothing in that type ever said "hand-pinned" or "horizontal": `price` is the line's
price *on this bar*, which an average has as surely as a level or a sloped line does. So a reader who
knows what a touch is here already knows, and `line_respect` reads this Series without being told
what drew the line.

What *is* new is three things.

- **There is no anchor bar, so nothing is skipped for being one.** `quiet` in `relations_of` means
  "the bars that *made* this line, which therefore agree with it by construction and are not
  evidence of anything" — the bar a level was read off, the two ends of a trend line. An average is
  made by every bar in the window and agrees with none of them by construction, so there is no such
  bar and the mechanism has to be switched off: `quiet` is `-1`, and the very first bar the average
  has a value on is asked in full.

  `-1` and not `0`, which would look identical today. Bar 0 is always inside the warm-up for any
  period this module can be handed, so silencing it would change nothing now and would be wrong the
  moment a source starts answering from bar 0. The warm-up is a *different fact* — "this line has
  nothing to say about that bar" — and that is exactly the contract `PriceAt` gives `None`. Two
  mechanisms, two meanings, and conflating them here would hide one behind the other.

- **The line is not an input.** Every other Pattern that asks these questions is *told* its
  geometry and trusts it: a level somebody pinned, a trend line somebody dragged, neither of which
  the engine can re-derive. This one is handed a Series the engine computed. Which is why there is
  no `PinnedAverages` wrapper and no `NO_AVERAGES` to stand for "nobody asked" — there is nothing
  for a browser to send, the source is in the pipeline on every run, and an empty Series here means
  the window was too short for the period rather than that nobody drew anything.

- **The line moves with the price it is made of**, and a reader should not carry the level intuition
  over unexamined. A touch of a level is price returning to somewhere it has been; a touch of an
  average is two moving things meeting, and the average is moving *because* of the bars doing the
  touching. The rule does not change, but its frequency does: `SEAM_SPAN`'s three bars are far
  cheaper to trigger when the line sits inside the body of a quiet range, which is where an average
  spends most of its life. There is no dial for that and there should not be — how meaningful a
  crossing of *this* average is, is a claim about the period, made by whoever chose it.

**One proximity rule for the pipeline, not a rule of its own.** `proximity` and `legs` are the same
two objects `LineRelationsPattern` and `TrendRelationsPattern` are handed — the single
`ProximityRule` a run carries, and therefore the same ladder whose `close` events `line_respect`
already folds into its stretches. Nothing here re-asks how near is near: a near miss is a fraction
of the zigzag leg the bar sits in, judged once by `reach`, and letting an average be judged by a
different ladder would make a `close` against the average incomparable with a `close` against a
pinned level — which is the one comparison anybody looking at both Series is making.

What it costs, stated rather than hidden:

- **The `close` kind is doubly non-final.** `line_relations` states the first half: a `close` is
  measured against the whole leg the bar sits in, so a longer window can grow the leg, grow the
  reach, and make a bar start reporting a `close` it did not report before. Here the *line* moves
  too — an unfinished bucket's value changes when the next bar lands — so both sides of that
  comparison can move. The other three kinds are still final once emitted.

- **The ladder only ever arrives on the `POST`.** `proximity` is a body parameter, so a run from the
  automatic `GET` answers three of the four kinds. That is not special to this Pattern and is
  argued in `playbook_api.routers.patterns`; it lands here as a Series that is complete on every
  request except in the one kind that has a dial.

- **Two implementations of one average, and no `close` between them.** The line this Series answers
  about is `weighted_average`'s, and the line on the chart is `weightedAverage`'s in the browser.
  They are written to agree and nothing enforces it — see `weighted_average`'s docstring, where that
  cost is paid in full. A reader comparing a `breakout` here against the drawn line is trusting that
  transcription.

- **Cost** is `O(bars)`, one pass, one line. The product `line_relations` pays over a pinned set is
  not paid here: a Pattern answers about exactly one average.
"""

from collections.abc import Sequence

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .line_relations import LineRelation, PriceAt, relations_of, spans_from
from .proximity import NO_PROXIMITY, ProximityRule
from .weighted_average import WeightedAverage

#: The `quiet` index this module hands `relations_of`: none, since an average has no anchor bar. See
#: the module docstring for why it is `-1` rather than `0`, and why that distinction is worth a name.
NO_ANCHOR = -1


def values_at(
    bars: Sequence[Candle], average: Sequence[WeightedAverage]
) -> list[float | None]:
    """The average's value on each bar of `bars`, by the bar's index. `None` where it said nothing.

    Joined on `time` and not on position, because the two sequences are not parallel: an average is
    silent through its warm-up, so its first Point is the window's `period`-th bar and a positional
    read would quote every value one stretch too early. The same `at_time` idiom `leg_spans` and
    `trend_relations` use, for the same reason.

    Returned as a list parallel to `bars` so the resolver beside this is a lookup rather than a
    search — one pass here instead of one scan per bar. A bar the source skipped and a bar past the
    source's end are one answer, `None`, which is the only thing `relations_of` reads.
    """
    at_time = {bar.time: at for at, bar in enumerate(bars)}
    values: list[float | None] = [None] * len(bars)

    for point in average:
        at = at_time.get(point.time)
        if at is not None:
            values[at] = point.value

    return values


def resolver(values: Sequence[float | None]) -> PriceAt:
    """`values` as the price-per-bar `relations_of` takes, silent wherever the average is.

    The counterpart of `constantly` for a level and of `trend_relations.resolver` for a slope, and
    the smallest of the three: the prices are already worked out per bar, so this is a bounds-checked
    index. The bound is not decoration — `relations_of` walks the bars of the window and a caller is
    free to hand a shorter list.
    """

    def price(at: int) -> float | None:
        return values[at] if 0 <= at < len(values) else None

    return price


def average_relations(
    bars: Sequence[Candle],
    values: Sequence[float | None],
    line: str,
    rule: ProximityRule = NO_PROXIMITY,
    spans: Sequence[float | None] = (),
) -> list[LineRelation]:
    """Every touch, close, breakout and seam in `bars` about the average `values` describes.

    The one average wrapped as the single entry `relations_of` takes, which is where the rules are.
    The counterpart of `line_relations` and `trend_relations`, and the three differ in exactly this
    function.

    `line` is what the answers are labelled with — the average's own name, `wma-30`, since there is
    no browser here to have named it. `rule` and `spans` are handed straight through, unread: the
    near-miss question is about a bar and a price, and an average has a price on every bar exactly
    as a level does. Which is this module's whole argument, applied once more.

    An average that said nothing at all — a window shorter than its period — is an empty answer
    rather than an error, the way a line outside the window is for its siblings.
    """
    if not bars or all(value is None for value in values):
        return []

    return relations_of(bars, [(line, NO_ANCHOR, resolver(values))], rule, spans)


class AverageRelationsPattern(Pattern):
    """`average_relations`, run over the Candles of `emits` for the average `source` produces.

    **One source, one average, and that is a decision.** A Pattern taking several averages would
    answer about all of them in one Series under one set of ids, and `pipeline.py` states the
    objection in its own case: a Pattern handed two sources could mix them and nothing downstream
    would be able to tell that it had. Declaring one instance per average keeps them apart in `ctx`
    by construction, since `producer` renders the source into the key. It also keeps the key
    readable — a *tuple* of Patterns renders as `<…>|<…>`, one parameter naming two averages.

    **`source` is the instance and never its key as a string**, the rule every source in this
    package follows, and it is **an ordering constraint**: declared before its average the run
    raises on a key that is not in `ctx` yet. `legs` is a second one, for the reason
    `LineRelationsPattern` gives — the near-miss reach is a fraction of a leg.

    **Nothing checks what kind of average it was handed.** `source` is typed `Pattern` and read for
    its Points' `value` and its `name`, so a second kind of average is a second source rather than a
    second Pattern here — the same openness `LineRespectPattern` has towards the two relations
    Series, and the reason this class is not called `WmaRelationsPattern`.

    `NO_PROXIMITY` alone turns the fourth kind off, and `legs=None` does too; both are the default,
    so a pipeline built without a browser answers the three kinds that need nothing but bars.

    Output is **sparse**: one Point per event, and a bar that did nothing about the average — which
    is most bars — emits nothing.
    """

    def __init__(
        self,
        *,
        source: Pattern,
        proximity: ProximityRule = NO_PROXIMITY,
        legs: Pattern | None = None,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.proximity = proximity
        self.legs = legs
        self.name = f"Relations · {source.name}"

    def run(self, ctx: Ctx) -> BaseSeries[LineRelation]:
        average: BaseSeries[WeightedAverage] = ctx[self.source.producer]
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            average_relations(
                bars.points,
                values_at(bars.points, average.points),
                self.source.name,
                self.proximity,
                spans_from(ctx, bars.points, self.legs),
            ),
        )
