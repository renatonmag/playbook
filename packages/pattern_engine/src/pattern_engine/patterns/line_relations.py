"""How bars behave around a line somebody drew — the one Pattern here that is *told* its geometry.

Every other Pattern in this package finds its own levels: a zigzag pivot, a leg extreme, the edge
of a gap. This one is handed them. A person looking at the monitor pins a leg extreme or the end
of a candle's wick, and asks what the bars since have done about that price. The line is not a
detection, it is an input, and nothing in the engine can re-derive it.

For each line, every bar **after the bar the line was read off** is asked three questions:

```
touch      the price falls inside one of the bar's two wicks
breakout   the open and the close sit on opposite sides of the price
seam       this breakout undoes an earlier one, within two bars
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

- **A breakout is strict on both ends.** Open and close both off the line, and on opposite sides.
  A close landing exactly on the price has not crossed it, and neither has a bar that opened there.

- **`side` always means where the bar *opened***, whichever kind the Point is. One meaning across
  the three kinds rather than one per kind, so a reader never has to ask which. On a breakout it
  says the whole direction on its own: the close is strictly on the other side, so `above` is a
  break down and `below` is a break up. It is `None` only when the open sits exactly on the line,
  which no breakout can do.

- **A seam is a breakout undone.** `bar_1` breaks one way, `bar_2` breaks the other, and `bar_2` is
  at most two bars past `bar_1`. Three bars later is not a seam — that is the whole content of the
  rule, and there is no dial for it: a different distance is a different claim about what "undone"
  means, and the caller would have no way to know which one it was reading.

  The bars in between are not looked at. `bar_1` and `bar_2` are the two that crossed; whatever the
  bar between them did, it did not undo anything, or it would be `bar_2` itself.

- **A seam does not consume its bars.** A bar that closes one seam can open the next: three
  alternating breakouts in a row are two seams, not one. They are two events, and price whipping
  across a line three times is more of what a seam is about, not less.

- **A breakout also emits its seam, never instead of it.** The two Points sit on the same bar, in
  that order, so a caller reading only breakouts sees every crossing and a caller reading only
  seams sees every reversal.

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
SEAM_SPAN = 2

#: What a Point says happened. Read the module docstring for what each one is; they are not
#: exclusive, and one bar can carry all three.
RelationKind = Literal["touch", "breakout", "seam"]

#: Which of a bar's two wicks made contact. The same two words the browser's `WickSide` uses, so a
#: level pinned off a wick and a touch reported on one are named alike.
Wick = Literal["high", "low"]

#: Where the bar opened, relative to the line. Never `None` on a breakout.
Side = Literal["above", "below"]


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
    #: Where the bar opened. `None` only when the open sits exactly on the line.
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

    `None` is "no breakout", and covers three cases that need no telling apart: the bar stayed on
    one side, or it opened on the line, or it closed on it. Returning the closing side rather than
    a bare `True` is what lets the seam test compare two breakouts without re-reading their bars.
    """
    opened = side_of(bar, price)
    if opened is None:
        return None

    closed: Side | None = (
        "above" if bar.close > price else "below" if bar.close < price else None
    )

    return closed if closed is not None and closed != opened else None


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

    #: The last breakout per line: which bar, and which side it closed on. One entry, not a list —
    #: a seam only ever looks at the most recent one, since anything older is out of `SEAM_SPAN`.
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

            found.append(
                LineRelation.anchored(
                    bar, line=line.id, price=price, kind="breakout",
                    wick=None, side=side, since=None,
                )
            )

            previous = last.get(line.id)
            if previous is not None:
                before, was = previous
                if was != closed and at - before <= SEAM_SPAN:
                    found.append(
                        LineRelation.anchored(
                            bar, line=line.id, price=price, kind="seam",
                            wick=None, side=side, since=bars[before],
                        )
                    )

            # After the seam test and unconditionally: this breakout is the one the next bar
            # measures itself against, whether or not it closed a seam of its own.
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
