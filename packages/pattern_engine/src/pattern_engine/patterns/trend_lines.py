"""Trend lines — the straight lines that connect the simple legs' pivots without cutting a candle.

Every Pattern below `simple-leg` answers about one leg, and `general-direction` holds an opinion
that outlives several. This one answers about the *geometry between* them: the support and
resistance lines a chart reader draws by eye, from one bottom to a later bottom and from one top to
a later top, kept only when the straight line between the two has clear air all the way across.

Four rules carry the whole thing:

- **Same side only.** A `LegMark` is a top (`direction == "high"`) or a bottom (`"low"`), and a
  line joins two marks of one side. Tops to tops is a ceiling, bottoms to bottoms a floor; a line
  from a top to a bottom is a leg, which `simple-leg` already draws.
- **A candle in the way kills the line.** Between the two endpoints the line sits at an
  interpolated price on each bar. A bottom line dies the moment some intervening candle's `low`
  is strictly *below* it, a top line the moment some `high` is strictly *above* it — that is what
  "in the way" means for a line meant to sit under, or over, the price action. Strictly: a candle
  resting exactly on the line is a candle the line touched, which is the whole point of a line.
  Wicks, not bodies — a low is where price actually went.
- **Every reachable pivot, not the next one.** Each mark is joined to *every* later same-side mark
  it can see, not merely to the first. A line that skips three pivots is the long trend the eye is
  looking for, and it is exactly the one a chain of nearest-neighbour links would never draw.
- **An endpoint is where the leg got to, not where it was marked.** `SimpleLegPattern` says it of
  its own Points: "`price` is the extreme of the **marked bar**, which is not always the extreme of
  the leg" — the turn rule reads one side at a time, so a leg can top out several bars before the
  bar that ends it. A line drawn from the mark therefore starts at a lower, later point, and the
  bar that actually made the high is one of the candles that *blocks* it. So each mark is first
  rewritten as the bar its leg reached: the highest `high` of the leg for a top, the lowest `low`
  for a bottom, over the leg's bars — the span from the previous mark to this one, inclusive,
  which is `split_legs`' own definition of a leg.

The output is a fan: one Point per surviving pair, anchored on the **first** of the two — where a
drawing wants to start, the reason `bar_gap` anchors on the first bar of its triple. The far
endpoint rides along whole, as `ZigZagPivot.since` and `BarGap.closed_by` do, because a time alone
would send every reader back to the source Series to price it.

What it costs, stated rather than hidden:

- **The Series is large, and that is the rule working.** `simple-leg` marks a leg roughly every
  three bars, so a 400-bar window carries ~65 marks per side and ~2,000 candidate pairs per side.
  The survivors are plausibly several hundred lines. Nothing is capped, ranked or thinned here:
  which of them is worth looking at is a question about a chart being read, and answering it in
  the detector would be a second opinion baked in where nothing can see it. The screen filters.
- **It is O(pairs × window).** The obvious nested scan, `bar_gap._closed_by`'s shape, and roughly
  a million integer comparisons on a wide window. Written plainly and left that way until a
  profile says otherwise.
- **Several Points share an anchor.** Every other Series in this engine has one Point per bar at
  most; here one pivot fans out to many lines, all anchored on it. `BaseSeries` allows it — it
  raises only on anchors that *decrease* — but `as_of` is correspondingly less useful: it answers
  "which line began last", not "which line is in force".
- **Lines repaint.** `simple-leg`'s last Point is the running leg and moves with every bar, so
  every line ending on it moves too, and can vanish outright when that leg finally closes
  elsewhere. `provisional` is the flag to filter on, carried here rather than decided here for the
  reason `simple_leg` carries it: which lines to trust is the reader's call.
- **The marks themselves are not in the output.** Both endpoints are `LineEnd`s standing on the
  bars the legs reached; a reader wanting the vertex that named a leg goes to `simple-leg`, which
  is where it lives. An endpoint can also coincide with the *neighbouring* leg's vertex bar, since
  a leg's span is inclusive at both ends, and the first leg's span is the truncated window head —
  it opens mid-leg, so its extreme is the best of what the window happens to show.
- **A pair with no bars between it is not a line.** Marks normally alternate sides but two can
  merge onto one bar, adjacent same-side marks can sit on neighbouring bars, and two legs can
  reach their extreme on the very same bar. There is nothing
  in between for a candle to block, so such a pair connects unconditionally — which is true and
  useless. Only pairs with at least one bar between them are emitted.
- **Nothing says a line is still unbroken.** It is clear between its endpoints, and says nothing
  at all about the bars after the second one. A line extended past its far pivot is a drawing
  decision, and it is the screen's — see `TrendLinesOverlay`.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Candle, Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_extremes import extreme_points
from .leg_processor import bar_positions, position_of
from .simple_leg import LegMark, integer


def clear(
    bars: Sequence[Candle],
    start: int,
    end: int,
    from_price: float,
    to_price: float,
    side: Literal["high", "low"],
) -> bool:
    """Whether the straight line from `(start, from_price)` to `(end, to_price)` has clear air.

    Indices into `bars`, not times: the interpolation is over bar *positions*, so a session gap
    shortens the line's run rather than stretching it, which is the same reading the chart gives —
    Lightweight Charts spaces bars evenly and knows nothing about the clock between them.

    Both sides go through `integer`, for the reason `general_direction` imports it: `a + slope * k`
    lands on values like `114728.99999999999`, and comparing that raw against a low of `1.14729`
    rejects a candle that is sitting exactly on the line. Rounding to the tick first makes "on the
    line" mean what a reader means by it.

    The endpoints are not tested. They are the line — each is a leg's own extreme, the price the
    line was drawn through, so testing it would reject every line against itself. And since an
    endpoint is now the leg's furthest bar rather than the bar it was marked on, the extreme that
    used to sit *between* two endpoints and block them is one of them.
    """
    span = end - start
    slope = (to_price - from_price) / span

    for offset in range(1, span):
        line = integer(from_price + slope * offset)
        bar = bars[start + offset]
        if side == "low":
            if integer(bar.low) < line:
                return False
        elif integer(bar.high) > line:
            return False

    return True


@dataclass(frozen=True, slots=True)
class LineEnd(Pivot):
    """One end of a trend line: the bar where a leg actually reached its extreme.

    Not a `LegMark`. A mark says *which* leg ended and on which side; this says *where that leg
    got to*, which is a different bar whenever the leg topped out before its turn was read — see
    the module docstring's fourth rule. The mark it came from is not carried: `simple-leg` is the
    Series that holds the vertices, and restating one here would be two Series claiming the fact.

    Named for the endpoint rather than the leg on purpose: `leg_extremes.py` already owns
    `LegExtremes`/`LegPoint`, which answer all three of a leg's defining levels. This is only the
    one a line is drawn through.
    """

    #: Which extreme this is, in `Pivot`'s vocabulary — the side of the mark whose leg it measures.
    direction: Literal["high", "low"]
    #: True when the mark this came from was `simple-leg`'s running one, so the leg is unfinished
    #: and its extreme moves with every bar.
    provisional: bool


def leg_ends(
    bars: Sequence[Candle], marks: Sequence[LegMark]
) -> list[tuple[LineEnd, int]]:
    """Each mark rewritten as the bar its leg reached, with that bar's position in `bars`.

    A mark's leg is the span from the **previous mark to it, inclusive** — `split_legs`' own
    definition, boundary bar shared and all — and the first mark takes the window head, the same
    fold `split_legs` does. The extreme over that span is the endpoint: the highest `high` for a
    top, the lowest `low` for a bottom.

    The extreme itself comes from `extreme_points`, which is where the tie rule (the earliest bar
    to reach a level keeps it) and the direction table are already written and tested. It answers
    all three of a leg's levels and only `reach`, the first, is wanted here; the two discarded
    passes are over a slice a few bars long, which is cheaper than a second strict scan living
    here and drifting from that one.

    Positions come back alongside because everything downstream is index work — the interpolation
    in `clear` and the "is there anything in between" guard — and looking a bar up twice by `time`
    would be the same dictionary hit written in two places.

    Raises `ValueError` through `position_of` for a mark that sits on no bar of `bars` — the
    mismatched-Timeframe guard, shared rather than rewritten.
    """
    positions = bar_positions(bars)

    ends: list[tuple[LineEnd, int]] = []
    opened = 0

    for mark in marks:
        at = position_of(mark, positions)
        leg = bars[opened : at + 1]
        # `reach` — how far the leg went — read on the leg's own side: a top mark closes a leg
        # that ran up, a bottom mark one that ran down.
        reach = extreme_points(leg, "bullish" if mark.direction == "high" else "bearish")[0]
        ends.append(
            (
                LineEnd.anchored(
                    leg[reach.at],
                    price=reach.price,
                    direction=mark.direction,
                    provisional=mark.provisional,
                ),
                opened + reach.at,
            )
        )
        opened = at

    return ends


def trend_lines(
    bars: Sequence[Candle], marks: Sequence[LegMark]
) -> list[tuple[LineEnd, LineEnd]]:
    """Every pair of same-side leg extremes whose straight line clears the candles between them.

    The marks are rewritten as the bars their legs reached — `leg_ends` — and it is those the line
    is drawn between. Everything after that is the pairing and nothing else: same side, something
    in between, clear air across.

    Yielded in the order of the *first* endpoint, which is what leaves the anchors non-decreasing
    and saves `BaseSeries` a sort it would otherwise need. That holds because a leg's extreme sits
    at or before its own mark, and so at or before the next leg's extreme. Within one anchor the
    far endpoints come out in their own order, nearest first; nothing downstream depends on that,
    and it is stated only so the tests can.

    Raises `ValueError` through `leg_ends` for a mark that sits on no bar of `bars`.
    """
    located = leg_ends(bars, marks)

    pairs: list[tuple[LineEnd, LineEnd]] = []

    for index, (start, at) in enumerate(located):
        for end, to in located[index + 1 :]:
            if end.direction != start.direction:
                continue
            # Nothing in between means nothing to block it: true, and no line anybody drew. Two
            # legs that reached their extreme on the same bar, or on neighbouring ones, land here.
            if to - at < 2:
                continue
            if clear(bars, at, to, start.price, end.price, start.direction):
                pairs.append((start, end))

    return pairs


@dataclass(frozen=True, slots=True)
class TrendLine(Pivot):
    """One trend line: the leg extreme it is drawn from, and the later extreme it reaches.

    `price` is the near end's own, so the Point reads as the line's near end and not merely as the
    bar under it. The far end is `to`, whole.
    """

    #: Which side both endpoints are, in `Pivot`'s vocabulary: `"high"` is a ceiling drawn along
    #: the tops, `"low"` a floor drawn along the bottoms.
    direction: Literal["high", "low"]
    #: The far endpoint, whole rather than as a time — `ZigZagPivot.since`'s precedent. It carries
    #: its own `price`, which is the second point the line passes through.
    to: LineEnd
    #: True when **either** endpoint measures `simple-leg`'s running leg, so this line moves with
    #: every bar and may vanish when that leg closes elsewhere. See the module docstring.
    provisional: bool


class TrendLinesPattern(Pattern):
    """`trend_lines` as a Pattern: a Series of the lines a detector's legs can be joined by.

    `source` is the detector's **instance**, not its producer key — the reason `LegPattern` gives:
    a key written as a string restates what `Pattern.producer` derives, and drifts into a run-time
    `KeyError` rather than an import-time one.

    It reads the bars as well as the Series, twice over and for two reasons: where each leg
    reached is a fact about the leg's candles, and a collision is a fact about the candles between
    two of those extremes. No Series carries either. Declare it *after* its source: declaration order
    is run order, and the wrong order leaves the key simply absent from `ctx`.

    Typed to `LegMark` rather than to `Pivot`, unlike `LegPattern`: `direction` is what puts a mark
    on the top side or the bottom one, and a bare `Pivot` has none. `ZigZagPivot` has the field and
    would work here, and is deliberately not offered — its vertices are already smoothed, and
    joining them is a different Pattern with a different name.
    """

    name = "Trend lines"

    def __init__(
        self, *, source: Pattern, reads: tuple[Timeframe, ...], emits: Timeframe
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source

    def run(self, ctx: Ctx) -> BaseSeries[TrendLine]:
        """Pair up the extremes of `source`'s legs over `emits`' Candles, one Point per line.

        The Candles are read twice over: once to find where each leg reached, and again to ask
        whether anything reaches through the line between two of those. Both are the same window,
        and neither is a lookup by `time` past the one `leg_ends` does.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        marks: BaseSeries[LegMark] = ctx[self.source.producer]

        points = [
            TrendLine.anchored(
                start,
                price=start.price,
                direction=start.direction,
                to=end,
                # Either end taints the line: the near one repaints as readily as the far one,
                # and a reader filtering on this wants "does this move" answered about the line.
                provisional=start.provisional or end.provisional,
            )
            for start, end in trend_lines(bars.points, marks.points)
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
