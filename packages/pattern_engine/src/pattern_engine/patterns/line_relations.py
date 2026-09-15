"""How bars behave around a line somebody drew — the one Pattern here that is *told* its geometry.

Every other Pattern in this package finds its own levels: a zigzag pivot, a leg extreme, the edge
of a gap. This one is handed them. A person looking at the monitor pins a leg extreme or the end
of a candle's wick, and asks what the bars since have done about that price. The line is not a
detection, it is an input, and nothing in the engine can re-derive it.

For each line, every bar **after the bar the line was read off** is asked three questions:

```
touch      the price falls inside one of the bar's two wicks
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

- **Nothing is provisional, and nothing is looked ahead to.** A seam is decided by bars that have
  already closed, so no Point of this Series moves once emitted. The flip side is the window: a
  seam whose `bar_1` fell before the window's first bar is not seen, and a line whose own bar is
  outside the window produces nothing at all — the reading `wickLevels` already gives a pin whose
  bar has scrolled away.

- **The anchor is the bar the event happened on**, so the OHLCV inherited from `Candle` is that
  bar's and describes it. `price` is the line's, not the bar's, and `line` is what the browser
  calls it — enough to send an answer back to the pin it came from without this Series knowing
  what a pin is.

- **Cost** is `O(bars x lines)`, one pass, with the per-line breakout history carried along. A
  pinned set is a handful of lines by hand, so the product is nothing.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe

#: How far past `bar_1` a reversing breakout still counts as a seam, in bars. Not a dial — see the
#: module docstring.
SEAM_SPAN = 3

#: What a Point says happened. Read the module docstring for what each one is; they are not
#: exclusive, and one bar can carry all three.
RelationKind = Literal["touch", "breakout", "seam"]

#: Which of a bar's two wicks made contact. The same two words the browser's `WickSide` uses, so a
#: level pinned off a wick and a touch reported on one are named alike.
Wick = Literal["high", "low"]

#: The side of the line price came from. Never `None` on a breakout.
Side = Literal["above", "below"]

#: The side opposite the one given. Two readings need it: a bar that opened exactly on the line
#: came from the side it did not close on, and a `seam` respected the side it closed back onto.
OPPOSITE: dict[Side, Side] = {"above": "below", "below": "above"}


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

    Three of the five fields are `None` on some kinds. Kept as one Point type rather than three,
    because they are three answers to one question asked of one pair — a caller reading "what has
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


def line_relations(bars: Sequence[Candle], lines: PinnedLines) -> list[LineRelation]:
    """Every touch, breakout and seam in `bars`, for every line, in bar order.

    Bars outer and lines inner, which is not a preference: `BaseSeries` refuses Points whose
    anchors decrease, and this loop order makes them non-decreasing without a sort. The same
    arrangement `BarsPattern.run` uses, and for the same reason.

    A line is skipped entirely when the window holds no bar at its `time` — there is no anchor to
    start after, and starting at the window's edge instead would silently answer about a different
    line than the one asked about.

    Takes a plain sequence rather than a Series, for the reason `bar_gaps` gives: what a relation
    is depends on the bar and the line and nothing else, and asking for the global history would
    advertise a dependency that does not exist.
    """
    if not lines or not bars:
        return []

    at_time = {bar.time: at for at, bar in enumerate(bars)}

    # Only the lines this window can answer about, resolved once. The index is the *anchor*; the
    # questions start one bar later.
    anchored = [(line, at_time[line.time]) for line in lines if line.time in at_time]
    if not anchored:
        return []

    #: The last crossing per line, under either name: which bar, and which side it closed on. One
    #: entry, not a list — a seam only ever looks at the most recent one, since anything older is
    #: out of `SEAM_SPAN`.
    last: dict[str, tuple[int, Side]] = {}

    found: list[LineRelation] = []

    for at, bar in enumerate(bars):
        for line, anchor in anchored:
            if at <= anchor:
                continue

            price = line.price
            side = side_of(bar, price)

            wick = touches(bar, price)
            if wick is not None:
                found.append(
                    LineRelation.anchored(
                        bar, line=line.id, price=price, kind="touch",
                        wick=wick, side=side, since=None,
                    )
                )

            closed = breaks_out(bar, price)
            if closed is None:
                continue

            # Which of the two names this crossing gets, decided before anything is emitted: a
            # crossing that undoes a recent one *is* the seam, and no breakout is emitted beside it.
            undone: Candle | None = None
            previous = last.get(line.id)
            if previous is not None:
                before, was = previous
                if was != closed and at - before <= SEAM_SPAN:
                    undone = bars[before]

            found.append(
                LineRelation.anchored(
                    bar, line=line.id, price=price,
                    kind="breakout" if undone is None else "seam",
                    wick=None,
                    # A bar that opened on the line still came from somewhere, and a crossing says
                    # where: the side it did not close on. This is the only place `side` is not
                    # simply `side_of`, and it is what keeps the field total on both crossings.
                    side=side if side is not None else OPPOSITE[closed],
                    since=undone,
                )
            )

            # After the seam test and unconditionally: this crossing is the one the next bar
            # measures itself against, whether it was named a breakout or a seam.
            last[line.id] = (at, closed)

    return found


class LineRelationsPattern(Pattern):
    """`line_relations`, run over the Candles of `emits` for the lines it was constructed with.

    **No sources, and one parameter that is not a dial.** Like `BarGapPattern` it reads `ctx[BARS]`
    and nothing else, so it has no ordering constraint in the pipeline and can be declared
    anywhere. Unlike every Pattern here, its `lines` come from outside the market — see the module
    docstring, and `playbook_api.routers.patterns` for why the browser is allowed to send them.

    With `NO_LINES` it produces an empty Series, which is what a pipeline built without a browser
    runs. That is deliberate: the Pattern is always in the list, so the `ctx` key always exists,
    and "nobody drew a line" is an empty Series rather than a missing producer.

    Output is **sparse**: one Point per event, and a bar that did nothing about any line emits
    nothing.
    """

    name = "Line relations"

    def __init__(
        self, *, lines: PinnedLines, reads: tuple[Timeframe, ...], emits: Timeframe
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.lines = lines

    def run(self, ctx: Ctx) -> BaseSeries[LineRelation]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            line_relations(bars.points, self.lines),
        )
