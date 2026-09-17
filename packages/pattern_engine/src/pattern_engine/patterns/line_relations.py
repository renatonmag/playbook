"""How bars behave around a line somebody drew — the one Pattern here that is *told* its geometry.

Every other Pattern in this package finds its own levels: a zigzag pivot, a leg extreme, the edge
of a gap. This one is handed them. A person looking at the monitor pins a leg extreme or the end
of a candle's wick, and asks what the bars since have done about that price. The line is not a
detection, it is an input, and nothing in the engine can re-derive it.

For each line, every bar **after the bar the line was read off** is asked four questions:

```
touch      the price falls inside one of the bar's two wicks
close      the bar stopped short of the price, near enough that stopping there means something
breakout   the close lands on the other side of the price from where the bar came
seam       this breakout undoes an earlier one, within three bars
```

The rules, and what each one deliberately does not say:

- **A touch is a wick, and only a wick.** `[max(open, close), high]` for the upper, `[low,
  min(open, close)]` for the lower, inclusive at both ends. A wick of zero length cannot touch —
  `high == max(open, close)` means there is no upper wick, and saying the line touched it would be
  claiming contact with something that is not there. The same reading `levelsOf` gives in
  `apps/web/app/utils/wick-levels.ts`, and it has to be the same: those are the lines being asked
  about.

- **A line through the body is not a touch, and loses nothing by it.** A price strictly between
  the open and the close has them on opposite sides *by definition* — that bar is a breakout, and
  it is reported as one. The two rules meet exactly there, so a third kind for "the body swallowed
  it" would be a second name for a fact already emitted. This is the one place where an omission
  is load-bearing rather than a gap, which is why it is written down.

  A line at the body's *edge* is a different bar and gets both names. When the open sits exactly on
  the line the line is the base of a wick, so `touches` answers, and if the close is off the line
  the bar crossed as well: one bar, one line, a `touch` and a crossing. The two rules are
  independent and stay that way — suppressing one because the other fired would be a third rule
  about their interaction, and neither answer is wrong.

- **A `close` is the near miss, and it is the one kind with a dial.** The line sits *outside* the
  bar's `[low, high]` entirely, and the distance from the nearer extreme to it is within the reach
  a `ProximityRule` grants — see `proximity.py`, which is where the whole of "how near is near"
  lives. That reach is a fraction of the leg the bar sits in, so the answer scales with the move
  rather than with a constant nobody could write down.

  **It cannot co-occur with any of the other three**, and not because anything suppresses it: the
  line is strictly outside the bar's range, so no wick can contain it and neither the open nor the
  close can be on the far side of it. Worth saying out loud, because everywhere else here two
  questions that both answer are both emitted, and a reader is owed the reason this one never does.

  With no rule — or with a leg no rung of the ladder claims — nothing is emitted and the other
  three answer exactly as they always did. A near miss is the one thing in this module that a
  caller can turn off, and it is off by default.

- **A breakout is strict on the close, and only on the close.** The close must be off the line and
  on the other side of it from where the bar came. A close landing exactly on the price has not
  crossed it — it stopped at it — and that is the whole of the strictness.

  The open is read where it can be. A bar that opens exactly on the line has no side to have left,
  and the close alone says which one it took: opening on the line and closing below it is a break
  down, opening on it and closing above is a break up. Refusing those was refusing the plainest
  break there is, and it is the reason a bar that steps off the line after an earlier crossing now
  undoes it.

- **`side` always means the side price *came from***, whichever kind the Point is. One meaning
  across the three kinds rather than one per kind, so a reader never has to ask which. On every bar
  that opened off the line that is where it opened; on a breakout that opened *on* the line it is
  the side it did not close on, which is the only side it can be said to have left.

  So on a breakout it still says the whole direction on its own — `above` is a break down and
  `below` is a break up — and it is never `None` there. `None` is left for the bar that opened on
  the line and did not cross it: nothing about it says which side it was on, and a touch is not
  going to guess.

- **A seam is a breakout undone.** `bar_1` breaks one way, `bar_2` breaks the other, and `bar_2` is
  at most three bars past `bar_1`. Four bars later is not a seam — that is the whole content of
  the rule, and there is no dial for it: a different distance is a different claim about what
  "undone" means, and the caller would have no way to know which one it was reading.

  The bars in between are not looked at. `bar_1` and `bar_2` are the two that crossed; whatever the
  bars between them did, they did not undo anything, or the first of them would be `bar_2` itself.

- **A seam does not consume its bars.** A bar that closes one seam can open the next: three
  alternating crossings in a row are two seams, not one. They are two events, and price whipping
  across a line three times is more of what a seam is about, not less. The bookkeeping says the
  same thing: a seam bar is still the crossing the next bar measures itself against, so nothing
  about being named a seam takes a bar out of the running.

- **A seam is the breakout, renamed — not a Point beside it.** A crossing that undoes a recent one
  emits one Point and it is the `seam`; there is no `breakout` on that bar as well. One bar and one
  line make one event, and emitting both would be naming the same crossing twice.

  What that costs is worth saying plainly: `breakout` no longer enumerates every crossing. A caller
  that wants all of them reads `breakout` **and** `seam`, and one that wants only the reversals
  reads `seam` alone — which is the reading the second kind exists for.

What it costs, stated rather than hidden:

- **The producer key does not name the lines.** `PinnedLines.__str__` answers a constant, so two
  runs over different lines answer under the same `ctx` key — the same trade `FormaRule.__str__`
  makes and for the same reason. The cost is the same too: the response does not say which lines
  ran, and a caller that caches has to fold them into its own key.

- **Three of the four kinds are final once emitted; `close` is not.** A touch, a breakout and a
  seam are decided by bars that have already closed, so those Points never move. A `close` is
  measured against the *whole* leg the bar sits in, including bars later than the event, so it is
  the one kind that looks ahead: as the leg grows its span grows, the reach grows with it, and a
  bar that reported nothing can start reporting a `close`, or report one with a wider `gap`, on a
  later run over a longer window. That is the price of scaling the answer to the move, and it was
  chosen deliberately over measuring the leg only as far as the bar — which would have made two
  bars of one leg answer under two different scales.

  The flip side is the window, and it is the same for every kind: a seam whose `bar_1` fell before
  the window's first bar is not seen, and a line whose own bar is outside the window produces
  nothing at all — the reading `wickLevels` already gives a pin whose bar has scrolled away.

- **The leg spans at the window's two ends are too large, and that is where the live edge is.**
  `split_legs` folds the bars before the first vertex into the first leg and the bars after the last
  into the last one, so those two legs each mix two real legs together — its own stated cost, and
  it lands here as a reach more generous than the rule asked for, on exactly the newest bars. There
  is no correction, because a leg the detector has not closed yet is not a leg this module gets to
  invent.

- **The anchor is the bar the event happened on**, so the OHLCV inherited from `Candle` is that
  bar's and describes it. `price` is the line's, not the bar's, and `line` is what the browser
  calls it — enough to send an answer back to the pin it came from without this Series knowing
  what a pin is.

- **Cost** is `O(bars x lines)`, one pass, with the per-line breakout history carried along. A
  pinned set is a handful of lines by hand, so the product is nothing.
"""

from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_processor import Leg
from .proximity import NO_PROXIMITY, ProximityRule, reach

#: How far past `bar_1` a reversing breakout still counts as a seam, in bars. Not a dial — see the
#: module docstring.
SEAM_SPAN = 3

#: What a Point says happened. Read the module docstring for what each one is. `touch` and a
#: crossing are not exclusive — one bar can carry both — and `close` is exclusive with all of them
#: by construction rather than by rule.
RelationKind = Literal["touch", "close", "breakout", "seam"]

#: Which of a bar's two wicks made contact. The same two words the browser's `WickSide` uses, so a
#: level pinned off a wick and a touch reported on one are named alike.
Wick = Literal["high", "low"]

#: The side of the line price came from. Never `None` on a breakout.
Side = Literal["above", "below"]

#: The side opposite the one given. Two readings need it: a bar that opened exactly on the line
#: came from the side it did not close on, and a `seam` respected the side it closed back onto.
OPPOSITE: dict[Side, Side] = {"above": "below", "below": "above"}

#: What one line is worth on one bar, by the bar's index. A level answers the same number whatever
#: it is asked; a sloped line interpolates. `None` means this line has nothing to say about that bar
#: — see `relations_of`, which is the only place it is read.
PriceAt = Callable[[int], float | None]


@dataclass(frozen=True, slots=True)
class Line:
    """One hand-placed level: where it starts, what price it sits at, and what its owner calls it.

    `id` is opaque here and stays that way. It is the browser's own segment id — a `wick:...`
    string or a leg-extreme's — carried through the engine untouched so an answer can be put back
    beside the line that provoked it. Nothing in this module parses it, the way `LevelSegments`
    never parses the id it hit-tests.

    `time` is the bar the line was read off, not the first bar it is asked about: the anchor bar
    made the level, so it agrees with it by construction and is skipped.
    """

    id: str
    time: datetime
    price: float


@dataclass(frozen=True, slots=True)
class PinnedLines:
    """The lines one run was handed, wrapped so they can be a Pattern parameter.

    A bare tuple would work everywhere except the one place that matters: `Pattern.producer`
    renders every parameter, so a tuple would put each line's price into the `ctx` key and move
    every key on every request. `__str__` answering a constant is what stops that, and it is
    exactly what `FormaRule.__str__` does for the same reason — see the module docstring for the
    cost that buys.

    Iterable and falsy-when-empty, so callers read it as the sequence it is.
    """

    lines: tuple[Line, ...]

    def __str__(self) -> str:
        return "pinned"

    def __iter__(self) -> Iterator[Line]:
        return iter(self.lines)

    def __len__(self) -> int:
        return len(self.lines)

    def __bool__(self) -> bool:
        return bool(self.lines)


#: The parameter a pipeline built without a browser gets: no lines, and so an empty Series.
NO_LINES = PinnedLines(())


@dataclass(frozen=True, slots=True)
class LineRelation(Candle):
    """One thing one bar did about one line, anchored on that bar.

    Five of the seven fields are `None` on some kinds. Kept as one Point type rather than four,
    because they are four answers to one question asked of one pair — a caller reading "what has
    this line seen" wants them interleaved in bar order, which is what a single Series is.
    """

    #: The line's own id, unparsed. See `Line.id`.
    line: str
    #: The line's price. Carried so a reader needs nothing but this Point to check the claim; the
    #: bar's own prices are the inherited OHLCV beside it.
    price: float
    kind: RelationKind
    #: Which wick the line fell inside. Only on a `touch` — on the other two kinds the line is not
    #: in a wick at all, or not necessarily, and naming one would be a guess.
    wick: Wick | None
    #: The side price came from: where the bar opened, or — on a crossing by a bar that opened
    #: exactly on the line — the side it did not close on. `None` only where neither can say.
    side: Side | None
    #: On a `seam`, the bar that broke out first — `bar_1`. `None` on the other two kinds.
    #:
    #: A whole Candle rather than a timestamp, the reason `BarGap.closed_by` carries one: what a
    #: reader wants next is that bar's own prices, and a timestamp would send them back to the
    #: Candles to look it up.
    since: Candle | None
    #: How far the line sat from the bar's nearer extreme. Only on a `close` — on the other three
    #: the bar reached the line or went through it, and the distance is zero by construction rather
    #: than by measurement.
    gap: float | None
    #: The span of the leg that set the reach, in points. Only on a `close`, and carried for the
    #: reason `price` is: with it and `gap` a reader can check the claim against the rule without
    #: leaving the Point.
    leg: float | None


def touches(bar: Candle, price: float) -> Wick | None:
    """Which of `bar`'s wicks `price` falls inside, or `None`.

    Direction-agnostic, which is what makes this one rule rather than two: on a bull bar the upper
    wick runs close to high and on a bear bar open to high, and `max(open, close)` is that
    distinction already made.

    A wick of zero length is not a wick, and answers `None` even for a price sitting exactly on it.
    The upper is tested first; a price can only be in both if the bar has no body and no wick, in
    which case it has no wick to be in.
    """
    top = max(bar.open, bar.close)
    bottom = min(bar.open, bar.close)

    if bar.high > top and top <= price <= bar.high:
        return "high"
    if bar.low < bottom and bar.low <= price <= bottom:
        return "low"

    return None


def nears(bar: Candle, price: float, within: float) -> tuple[Side, float] | None:
    """The side `bar` sits on and how far short it stopped, when it stopped short by `within` or less.

    `touches`' complement, and the pair covers the line: a line inside `[low, high]` was reached and
    is that function's business, a line outside it was not, and this one asks whether the miss was
    a near one. Strictly outside, so the two can never both answer — `high == price` is contact and
    belongs to the other reading.

    `side` is the side price came from, the one meaning this module gives that word everywhere: a
    bar entirely below the line came from below, whatever it did on the way. Returned with the
    distance rather than as a bare `True`, because the caller emits both and re-deriving the gap
    from the side would be the same subtraction written twice.
    """
    if price > bar.high:
        gap = price - bar.high
        return ("below", gap) if gap <= within else None

    if price < bar.low:
        gap = bar.low - price
        return ("above", gap) if gap <= within else None

    return None


def leg_spans(bars: Sequence[Candle], legs: Sequence[Leg]) -> list[float | None]:
    """How big the leg covering each bar is, in points, by the bar's index.

    A leg's span is `max(high) - min(low)` over its own bars — the height of the move, not the
    distance between its vertices, so a wick that overshot the vertex counts. `None` for a bar no
    leg covers, which is every bar when the window held too few vertices to carve one.

    Legs overlap by exactly one bar, the vertex that closes one and opens the next. The walk is in
    leg order and writes unconditionally, so the **later** leg wins there: the bar that ends a move
    is the first bar of the one that follows, and the move in force from it is the new one.

    Built once per run and handed to `relations_of` as a list, because a span is a fact about the
    bar and not about the line — deriving it inside the line loop would recompute the same number
    once per pinned line.
    """
    at_time = {bar.time: at for at, bar in enumerate(bars)}
    spans: list[float | None] = [None] * len(bars)

    for leg in legs:
        if not leg.bars:
            continue

        span = max(bar.high for bar in leg.bars) - min(bar.low for bar in leg.bars)
        for bar in leg.bars:
            at = at_time.get(bar.time)
            if at is not None:
                spans[at] = span

    return spans


def side_of(bar: Candle, price: float) -> Side | None:
    """Where `bar` opened relative to `price`, or `None` when it opened exactly on it."""
    if bar.open > price:
        return "above"
    if bar.open < price:
        return "below"

    return None


def breaks_out(bar: Candle, price: float) -> Side | None:
    """The side `bar` *closed* on, if open and close sit on opposite sides of `price`.

    The close is read first because it is the strict end: a bar that closed on the line crossed
    nothing, whatever its open did. `None` then covers the two remaining cases, which need no
    telling apart: the bar closed on the line, or it closed on the side it opened on.

    A bar that opened exactly on the line is a breakout to the side it closed on. `side_of` answers
    `None` there, which is not the closing side, so the comparison below reports the crossing
    without a case of its own. Returning the closing side rather than a bare `True` is what lets
    the seam test compare two breakouts without re-reading their bars.
    """
    closed: Side | None = (
        "above" if bar.close > price else "below" if bar.close < price else None
    )
    if closed is None:
        return None

    return closed if side_of(bar, price) != closed else None


def relations_of(
    bars: Sequence[Candle],
    anchored: Sequence[tuple[str, int, PriceAt]],
    rule: ProximityRule = NO_PROXIMITY,
    spans: Sequence[float | None] = (),
) -> list[LineRelation]:
    """Every touch, close, breakout and seam in `bars`, for lines already resolved against this window.

    The driver behind `line_relations` and `trend_relations` — the rules of the module docstring,
    written once. What the two callers differ in is *what a line is worth on a bar*, and that is the
    whole of what `anchored` carries: an id, the last bar to stay silent about, and a function from
    a bar's index to the line's price there. A level answers a constant; a sloped line interpolates.

    `at` is an index rather than a Candle because a sloped line is read off bar *positions* — see
    `trend_relations.price_at`. A resolver answering `None` means this line has nothing to say about
    this bar, which is how a caller skips a bar in the middle of a line's run without this driver
    learning what such a bar is.

    Bars outer and lines inner, which is not a preference: `BaseSeries` refuses Points whose
    anchors decrease, and this loop order makes them non-decreasing without a sort. The same
    arrangement `BarsPattern.run` uses, and for the same reason.

    `rule` and `spans` are the near-miss question and nothing else — see `nears` and `proximity.py`.
    They default to "off" together, and a caller that passes neither gets the three kinds this
    driver emitted before either existed, Point for Point. `spans` is indexed by bar and may be
    shorter than `bars` or empty; a bar past its end has no leg and so no reach, which is the same
    answer an entry of `None` gives.

    Takes plain sequences rather than a Series, for the reason `bar_gaps` gives: what a relation
    is depends on the bar and the line and nothing else, and asking for the global history would
    advertise a dependency that does not exist.
    """
    #: The last crossing per line, under either name: which bar, and which side it closed on. One
    #: entry, not a list — a seam only ever looks at the most recent one, since anything older is
    #: out of `SEAM_SPAN`.
    last: dict[str, tuple[int, Side]] = {}

    found: list[LineRelation] = []

    for at, bar in enumerate(bars):
        # The scale is a fact about the bar's leg and not about any line, so it is read once here
        # rather than once per line: every line asked about this bar is asked under the same reach.
        span = spans[at] if at < len(spans) else None
        within = reach(rule, span)

        for line, quiet, price_at in anchored:
            if at <= quiet:
                continue

            price = price_at(at)
            if price is None:
                continue

            side = side_of(bar, price)

            wick = touches(bar, price)
            if wick is not None:
                found.append(
                    LineRelation.anchored(
                        bar, line=line, price=price, kind="touch",
                        wick=wick, side=side, since=None, gap=None, leg=None,
                    )
                )

            # Asked only where a rule granted a reach, and never guarded against the two answers
            # above: a line near enough to be missed is outside the bar entirely, so `touches` and
            # `breaks_out` have both already answered `None` — see the module docstring.
            near = nears(bar, price, within) if within is not None else None
            if near is not None:
                from_side, gap = near
                found.append(
                    LineRelation.anchored(
                        bar, line=line, price=price, kind="close",
                        wick=None, side=from_side, since=None, gap=gap, leg=span,
                    )
                )

            closed = breaks_out(bar, price)
            if closed is None:
                continue

            # Which of the two names this crossing gets, decided before anything is emitted: a
            # crossing that undoes a recent one *is* the seam, and no breakout is emitted beside it.
            undone: Candle | None = None
            previous = last.get(line)
            if previous is not None:
                before, was = previous
                if was != closed and at - before <= SEAM_SPAN:
                    undone = bars[before]

            found.append(
                LineRelation.anchored(
                    bar, line=line, price=price,
                    kind="breakout" if undone is None else "seam",
                    wick=None,
                    # A bar that opened on the line still came from somewhere, and a crossing says
                    # where: the side it did not close on. This is the only place `side` is not
                    # simply `side_of`, and it is what keeps the field total on both crossings.
                    side=side if side is not None else OPPOSITE[closed],
                    since=undone,
                    gap=None,
                    leg=None,
                )
            )

            # After the seam test and unconditionally: this crossing is the one the next bar
            # measures itself against, whether it was named a breakout or a seam.
            last[line] = (at, closed)

    return found


def line_relations(
    bars: Sequence[Candle],
    lines: PinnedLines,
    rule: ProximityRule = NO_PROXIMITY,
    spans: Sequence[float | None] = (),
) -> list[LineRelation]:
    """Every touch, close, breakout and seam in `bars`, for every level, in bar order.

    The levels resolved against this window, then handed to `relations_of`, which is where the rules
    are. A level's price does not depend on the bar, so its resolver ignores the index it is given —
    the one line of this function that a sloped line does differently.

    A line is skipped entirely when the window holds no bar at its `time` — there is no anchor to
    start after, and starting at the window's edge instead would silently answer about a different
    line than the one asked about.
    """
    if not lines or not bars:
        return []

    at_time = {bar.time: at for at, bar in enumerate(bars)}

    # Only the lines this window can answer about, resolved once. The index is the *anchor*; the
    # questions start one bar later.
    anchored = [
        (line.id, at_time[line.time], constantly(line.price))
        for line in lines
        if line.time in at_time
    ]
    if not anchored:
        return []

    return relations_of(bars, anchored, rule, spans)


def spans_from(ctx: Ctx, bars: Sequence[Candle], legs: Pattern | None) -> list[float | None]:
    """The per-bar leg spans a run measures near misses against, or none at all.

    The one line of a Pattern's `run` that reads the optional leg source, written once because both
    `LineRelationsPattern` and its sloped twin need it and there is one definition of what a span
    is. `None` for the source means the question is off, and an empty list says that to
    `relations_of` in the only way it reads.
    """
    if legs is None:
        return []

    source: BaseSeries[Leg] = ctx[legs.producer]
    return leg_spans(bars, source.points)


def constantly(price: float) -> PriceAt:
    """A level's resolver: the same price on every bar, whichever one is asked about."""
    return lambda _: price


class LineRelationsPattern(Pattern):
    """`line_relations`, run over the Candles of `emits` for the lines it was constructed with.

    **Two parameters that are not dials, and one optional source.** Its `lines` come from outside
    the market — see the module docstring, and `playbook_api.routers.patterns` for why the browser
    is allowed to send them — and its `proximity` rule is the same kind of thing: a claim a person
    makes about what they are watching, which only the engine can apply.

    `legs` is what makes the near-miss question answerable, and it is **an ordering constraint**.
    This Pattern used to read `ctx[BARS]` and nothing else, and could sit anywhere in a pipeline
    like `BarGapPattern`; given a `legs` source it reads that producer's key, so declared before it
    the run raises on a key that is not in `ctx` yet. The source is the `LegPattern` *instance* and
    never its key as a string, the rule every source in this package follows.

    `legs=None` and `NO_PROXIMITY` are each enough to turn the fourth kind off, and both are the
    default: a pipeline built without a browser answers exactly what it answered before either
    parameter existed. Passing `legs` without a rule is not an error and costs one leg walk — the
    spans are built and every one of them finds no rung.

    With `NO_LINES` it produces an empty Series, which is what a pipeline built without a browser
    runs. That is deliberate: the Pattern is always in the list, so the `ctx` key always exists,
    and "nobody drew a line" is an empty Series rather than a missing producer.

    Output is **sparse**: one Point per event, and a bar that did nothing about any line emits
    nothing.
    """

    name = "Line relations"

    def __init__(
        self,
        *,
        lines: PinnedLines,
        proximity: ProximityRule = NO_PROXIMITY,
        legs: Pattern | None = None,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.lines = lines
        self.proximity = proximity
        self.legs = legs

    def run(self, ctx: Ctx) -> BaseSeries[LineRelation]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            line_relations(
                bars.points, self.lines, self.proximity, spans_from(ctx, bars.points, self.legs)
            ),
        )
