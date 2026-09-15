"""The same questions `line_relations` asks of a level, asked of a line that slopes.

A person looking at the monitor pins one of the trend lines the fan proposed — a ceiling along two
tops, a floor along two bottoms — or drags its ends onto the bars they meant, and then asks the
thing a trend line exists for: *is price still respecting it?* `TrendLinesPattern` will not answer
that. It says a line had clear air **between its endpoints** and is explicit that it says nothing
past the second one (`trend_lines`'s last rule: "A line extended past its far pivot is a drawing
decision, and it is the screen's"). This Pattern is where that drawing decision becomes a question
with an answer.

**The rules are not new, and that is the point.** Touch, breakout and seam are
`line_relations`' three, unchanged, and the loop that applies them is literally the same code —
`relations_of`. The Points are `LineRelation`s. Nothing in that type ever said "horizontal":
`price` is the line's price *on this bar*, which a sloped line has as surely as a level does. So a
reader who knows what a touch is here already knows, and `line_respect` reads this Series without
being told which kind of line drew it.

What *is* new is two things:

- **Every bar after the near anchor is asked, and both anchor bars are skipped.** This is the level
  rule unchanged — the anchors are the bars the line was read off, so they agree with it by
  construction and are not evidence of anything. Which leaves the bars *between* the two anchors in
  the question, deliberately: `trend_lines.clear` vouched for them on bodies only and with two bars
  exempt at each end, so a touch in there is real and unreported, and a reader watching a floor form
  wants it. And it leaves every bar past the far anchor in too, along the same slope, out to the
  window's edge — which is the extension the screen draws and the reason anybody pinned the line.

- **The price is interpolated over bar *positions*, not over the clock.** `clear` does the same and
  says why: a session gap shortens a line's run rather than stretching it, which is the reading the
  chart gives, since Lightweight Charts spaces bars evenly and knows nothing about the hours between
  them. Doing it any other way would put this Pattern's answer somewhere other than where the line
  is drawn.

What it costs, stated rather than hidden:

- **The extrapolation is unbounded and unhedged.** Past the far anchor the slope simply keeps
  running, so a steep line asked about a bar far enough out is somewhere no price will ever be, and
  this Pattern will report that as silence rather than as nonsense. There is no dial for how far an
  extension stays meaningful, and there should not be: that is a claim about the line, and the
  person who pinned it is the one making it.

- **The line is trusted, not checked.** Nothing here re-runs `clear`, and a hand-dragged line has
  never been through it at all. A caller may pin a line with candles sitting right through it and
  this Pattern will answer about it in full. That is the same trust `line_relations` places in a
  pinned level, and for the same reason — the line is an input, not a detection.

- **A trend needs both its bars in the window.** One anchor outside it and the whole line is
  skipped, where a level needs only its single bar. The slope cannot be resolved from one end, and
  guessing it from the prices alone would be answering about a line nobody drew. Two anchors on the
  *same* bar are refused for the same reason: there is no slope there to run.

- **Rounded to the tick, like `clear`.** `from_price + slope * k` lands on values like
  `114728.99999999999`, and `breaks_out` is strict on the close — without the rounding, a close
  sitting exactly on the line would read as a break every time and the strictness would be dead
  letter. `integer` is imported for that, the same import `clear` and `general_direction` make.

- **Cost** is `O(bars x trends)`, one pass, the same as its sibling and for the same reason: a
  pinned set is a handful of lines by hand.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .line_relations import LineRelation, PriceAt, relations_of
from .simple_leg import SCALE, integer


@dataclass(frozen=True, slots=True)
class PinnedTrend:
    """One hand-kept trend line: its two ends, and what its owner calls it.

    `id` is opaque here and stays that way, exactly as `Line.id` is. It is the browser's own
    segment id — `trendSegmentId`'s `from:to:side`, or the key of a line somebody dragged — carried
    through untouched so an answer can be put back beside the line that provoked it.

    The two ends are `from` and `to` as the caller named them, not near and far: which is which on
    the time axis is this module's business to work out, and a caller that had to sort them first
    would be a second place where that could be got wrong. Both must be bars of the window.
    """

    id: str
    from_time: datetime
    from_price: float
    to_time: datetime
    to_price: float


@dataclass(frozen=True, slots=True)
class PinnedTrends:
    """The trend lines one run was handed, wrapped so they can be a Pattern parameter.

    `__str__` answering a constant is the whole reason this type exists rather than a bare tuple,
    and `PinnedLines` states the argument in full: `Pattern.producer` renders every parameter, so a
    tuple would put four prices per line into the `ctx` key and move every key on every request.

    Iterable and falsy-when-empty, so callers read it as the sequence it is.
    """

    trends: tuple[PinnedTrend, ...]

    def __str__(self) -> str:
        return "pinned"

    def __iter__(self) -> Iterator[PinnedTrend]:
        return iter(self.trends)

    def __len__(self) -> int:
        return len(self.trends)

    def __bool__(self) -> bool:
        return bool(self.trends)


#: The parameter a pipeline built without a browser gets: no lines, and so an empty Series.
NO_TRENDS = PinnedTrends(())


def price_at(trend: PinnedTrend, start: int, end: int, at: int) -> float:
    """What `trend` is worth on bar `at`, given the bar positions of its two ends.

    `start` is where `from_price` sits and `end` where `to_price` does — the caller's own two ends,
    in the caller's own order, so this is one formula and not a case analysis. `at` may be before
    `start` or past `end`; the slope runs either way, which is what makes the extension past the far
    anchor an interpolation rather than a second rule.

    Positions and not times — see the module docstring, and `trend_lines.clear`, which interpolates
    the same way and is the reading this one has to agree with.

    Through `integer` and back out of it, so what comes back is a price rounded to the tick: a raw
    `from_price + slope * k` is `114728.99999999999` where a reader means `1.14729`, and every
    caller of this feeds the result into `<` and `>` against a bar's own prices.
    """
    slope = (trend.to_price - trend.from_price) / (end - start)
    return integer(trend.from_price + slope * (at - start)) / SCALE


def resolver(trend: PinnedTrend, start: int, end: int) -> PriceAt:
    """`trend` as the price-per-bar `relations_of` takes, silent on the two bars that drew it.

    The near anchor is handled by the `quiet` index beside this in `relations_of`; the far one has
    no such slot, since it sits in the middle of the run, so it is answered `None` here. Two ways of
    saying one thing, and they are two because the driver already had the first one for a level,
    where there is no second anchor to skip.
    """
    near, far = min(start, end), max(start, end)

    def price(at: int) -> float | None:
        if at <= near or at == far:
            return None
        return price_at(trend, start, end, at)

    return price


def trend_relations(
    bars: Sequence[Candle], trends: PinnedTrends
) -> list[LineRelation]:
    """Every touch, breakout and seam in `bars`, for every trend line, in bar order.

    The lines resolved against this window, then handed to `relations_of`, which is where the rules
    are. The counterpart of `line_relations`, and the two differ in exactly this function.

    A trend is skipped entirely when the window holds no bar at either of its ends, or when both
    ends land on one bar — see the module docstring for why neither is recoverable.
    """
    if not trends or not bars:
        return []

    at_time = {bar.time: at for at, bar in enumerate(bars)}

    anchored: list[tuple[str, int, PriceAt]] = []
    for trend in trends:
        start = at_time.get(trend.from_time)
        end = at_time.get(trend.to_time)
        if start is None or end is None or start == end:
            continue
        anchored.append((trend.id, min(start, end), resolver(trend, start, end)))

    if not anchored:
        return []

    return relations_of(bars, anchored)


class TrendRelationsPattern(Pattern):
    """`trend_relations`, run over the Candles of `emits` for the lines it was constructed with.

    **No sources, and one parameter that is not a dial.** The shape `LineRelationsPattern` has, for
    its reasons: it reads `ctx[BARS]` and nothing else, so it has no ordering constraint and can be
    declared anywhere, and its `trends` come from outside the market — see the module docstring, and
    `playbook_api.routers.patterns` for why the browser is allowed to send them.

    Deliberately not sourced from `TrendLinesPattern`, though that is where most of these lines are
    first drawn. What is pinned is a person's choice out of a fan of hundreds, plus the ones they
    dragged by hand, and neither is anything a source Series could tell this Pattern. Reading the
    fan instead would answer about every line nobody asked about.

    With `NO_TRENDS` it produces an empty Series, which is what a pipeline built without a browser
    runs — the same "empty Series rather than a missing producer" its sibling relies on.

    Output is **sparse**: one Point per event, and a bar that did nothing about any line emits
    nothing.
    """

    name = "Trend relations"

    def __init__(
        self, *, trends: PinnedTrends, reads: tuple[Timeframe, ...], emits: Timeframe
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.trends = trends

    def run(self, ctx: Ctx) -> BaseSeries[LineRelation]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            trend_relations(bars.points, self.trends),
        )
