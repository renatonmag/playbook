"""The bars inside each leg that a reversal filter marks — the two-bar pair, and the Forma rule.

`LegWindowPattern` hands over a leg and the bars it is made of. Nothing had yet looked *inside*
those bars. This does, with the two filters this project has been studying in the browser:

- **The two-bar reversal** — two adjacent Candles, each with a body dominating its own shadows,
  in opposite colours, of comparable size, and large for the moment they happened in. Ported
  from `apps/web/app/utils/two-bar-reversal.ts`.
- **The Forma rule** — one Candle whose proportions match a candidate rule from
  `docs/forma/rules.json`. Ported as `marks` in `shape.py`.

The two are a **union, not a composition**. They are mutually exclusive by arithmetic at the
default `k`: `dominates` forces `body >= k * wf`, and rule K wants `wf >= 0.49` with
`body <= 0.35`, which together need `k <= 0.714`. One describes a hammer and the other a bar
whose body swallows its shadows. So this Pattern answers "which bars of this leg are candidates
for the turn", by either reading, and a bar that somehow satisfied both would be listed twice.

**Everything is measured in the global history, not in the leg's slice.** A leg is a window onto
`ctx["bars"]`, and both filters read *outside* whatever window they are handed: `expands` averages
the ten Candles before a pair, and a pair can straddle a leg's first bar. Measuring inside the
slice would judge the opening bars of every leg against a truncated average — a different verdict
from the bench, for no reason but the slicing. So each leg's bars are translated back to their
global indices and the filters run there. The leg decides only *which* bars get listed.

**The direction comes from the leg, never from the rule.** A leg closing on a low is a fall that
ended, so the bar worth marking there is a bullish one; a leg closing on a high wants a bearish
one. `FormaRule` therefore has no `direction` field at all, and the pair filter asks that the bar
*closing* the pair carry the colour of the reversal. This is why the pivots are a second input:
`LegWindow` anchors on its opening vertex and does not say which extreme its closing vertex is.

What it costs, stated rather than hidden:

- **The arithmetic now exists twice**, here and in TypeScript, with nothing comparing them. The
  defence is `/verify` next to `/two-bar-reversal`, read by a person.
- **Candles with no amplitude are counted in the average** and are never marked. `/shapes` drops
  them before the bench sees them, so the two disagree by three bars in the `5m` history of
  `WIN@N` — immaterial in effect, real in principle.
- **Consecutive legs overlap** by `ahead + 1` bars, so a bar in a leg's tail is listed again as
  part of the next leg. That is a property of `LegWindow`, restated here rather than fixed: the
  question is what each leg contains, and a bar can be in two legs.
- **A chained run is not merged.** The TypeScript collapses `(1,2)` and `(2,3)` into one
  occurrence of three bars; here every bar of the run is listed once, in order, and the run is
  read off the contiguous `at` values. Same information, one item per bar.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction, FormaRule, Shape, marks, shape_of
from ..timeframes import SECONDS, Timeframe
from .leg_processor import bar_positions, position_of
from .leg_window import LegWindow
from .zigzag import ZigZagPivot

#: How far the body must beat the larger shadow. `1` is "at least as large as", which on its own
#: pins the body above `k / (k + 2)` — a third.
DEFAULT_K = 1.0

#: How alike the two bodies must be in size, as `min / max`. On by default, unlike `k`'s neutral
#: `1`: a big shove one way answered by a token nudge back is not a reversal, however clean each
#: bar looks alone.
DEFAULT_SIMILARITY = 0.65

#: How many times the recent average amplitude the larger of the two bars must reach. Without it
#: the rule marks the whole of a quiet range, where every bar is a clean little body and the
#: alternation is just noise taking turns.
DEFAULT_EXPANSION = 0.9

#: How many preceding Candles the amplitude average is taken over. A constant rather than a dial:
#: what the number buys is a sense of "recently", and moving it between 8 and 15 barely moves the
#: counts, so a control for it would look meaningful and not be.
AVERAGE_WINDOW = 10

#: Which filter marked a bar. Two names rather than a flag, because they are different claims
#: about different shapes — see the module docstring on why they never both hold.
MarkType = Literal["two-bar", "reversal-bar"]


@dataclass(frozen=True, slots=True)
class LegBar(Candle):
    """One bar a filter marked, inside one leg.

    Not a Series Point: these live in the `found` list of a `LegReversals`, so `time` here is not
    an anchor, just the bar's own. It is the field this Pattern exists to produce — the answer to
    "which bar, so I can find it on the chart".
    """

    #: Where the bar sits in `bars` of the `LegWindow` this leg came from. Only meaningful
    #: alongside that leg, which is why the two travel together.
    at: int
    type: MarkType


@dataclass(frozen=True, slots=True)
class LegReversals(Candle):
    """One leg's marked bars. Anchored on the leg's opening vertex, like `LegWindow` is.

    Carries the anchor and the list, and nothing else — not `since`, not `end`, not the leg's
    direction. Those are on the `LegWindow` Point at the same anchor, and restating them here
    would be two Series claiming the same fact.
    """

    #: Empty when this leg produced nothing. Emitted anyway: an absent leg and a leg that matched
    #: nothing are different facts, and only one of them means the filter is too tight.
    found: tuple[LegBar, ...]


def amplitude(candle: Candle) -> float:
    """`H - L` — how much ground the bar covered."""
    return candle.high - candle.low


def body_points(candle: Candle) -> float:
    """The body in the Instrument's own points — the price actually travelled, open to close.

    The one place size enters. Everything else read here is scale-free, and has to stay that way:
    `Shape.body` is a fraction of its *own* bar, so two bodies of 0.6 are equally dominant and may
    be 500 points and 40 points.
    """
    return abs(candle.close - candle.open)


def dominates(shape: Shape, k: float) -> bool:
    """Whether the body beats the larger of the two shadows.

    `>=` rather than `>`, which is not free: about 2% of the Candles in the `5m` history sit
    exactly on the line at `k = 1`, and each pair reads two of them.
    """
    return shape.body >= k * max(shape.upper, shape.lower)


def implied_body_min(k: float) -> float:
    """The floor on the body a given `k` enforces on its own — `k / (k + 2)`.

    With `upper + lower + body == 1` the larger shadow is at least `(1 - body) / 2`, so
    `dominates` already bounds the body from below. Stated so nobody adds a floor the dial
    guarantees.
    """
    return k / (k + 2)


def alike(a: Candle, b: Candle, similarity: float) -> bool:
    """Whether the two bodies are close enough in size — `min / max >= similarity`.

    The only test here that compares the two Candles *to each other*: `dominates` asks each bar
    about its own shadows and cannot see across the pair. Takes Candles rather than Shapes because
    it is the one comparison that needs the size back.
    """
    first, second = body_points(a), body_points(b)
    larger = max(first, second)
    if larger <= 0:
        return True
    return min(first, second) / larger >= similarity


def adjacent(a: Candle, b: Candle, timeframe: Timeframe) -> bool:
    """Whether `b` is the Candle that immediately follows `a` — in time, not in an array.

    Two claims, both required. The interval must be exactly one bar, and the two must fall on the
    same day. Reads `time` as UTC, which is what `Candle` declares it to be: the session boundary
    has to be the same one wherever this runs, or the counts would depend on a timezone.

    The same-day test is redundant against today's data, where every non-contiguous step is
    already a session boundary. It is here for the data that does not exist yet — an after-market
    session crossing midnight, or a Candle missing from the middle of a session.
    """
    if (b.time - a.time).total_seconds() != SECONDS[timeframe]:
        return False
    return a.time.date() == b.time.date()


def average_amplitude(bars: Sequence[Candle], i: int, timeframe: Timeframe) -> float | None:
    """The mean amplitude of the Candles immediately before `bars[i]`, or `None` when there are
    none to average.

    Walks backwards through `adjacent`, so the window stops at a session boundary rather than
    averaging yesterday's afternoon into this morning's first bars. A short window is used as-is
    rather than rejected: that would throw away the opening of every session in the history, and
    a mean of four bars is still an answer to "was this big for the moment", just a noisier one.
    """
    total = 0.0
    seen = 0

    j = i - 1
    while j >= 0 and seen < AVERAGE_WINDOW:
        if not adjacent(bars[j], bars[j + 1], timeframe):
            break
        total += amplitude(bars[j])
        seen += 1
        j -= 1

    return None if seen == 0 else total / seen


def expands(bars: Sequence[Candle], i: int, factor: float, timeframe: Timeframe) -> bool:
    """Whether the pair at `i` is large for where it happened — `max(amplitude) >= factor * mean`.

    **At least one** of the two bars, not both: a reversal is often one ordinary bar answered by
    an outsized one, and demanding it of both asks for two exceptional bars in a row, which is a
    rarer and different thing.

    Amplitude rather than body: this asks how much ground the bar covered, and a long rejection
    wick is ground covered. The body is `similarity`'s business, and the two dials stay on
    separate measurements so tightening one does not quietly do the other's job.

    Passes when there is nothing to compare against. A comparison with no second term cannot
    reject.
    """
    if factor <= 0:
        return True

    average = average_amplitude(bars, i, timeframe)
    if average is None or average <= 0:
        return True

    return max(amplitude(bars[i]), amplitude(bars[i + 1])) >= factor * average


def reverses(
    bars: Sequence[Candle],
    shapes: Sequence[Shape | None],
    i: int,
    direction: Direction,
    k: float,
    similarity: float,
    expansion: float,
    timeframe: Timeframe,
) -> bool:
    """Whether the pair `(i, i + 1)` is a reversal in `direction`.

    Takes the whole array and an index rather than the two Candles, because `expands` reads the
    bars *before* the pair and a pair alone cannot answer it. Out-of-range and shapeless Candles
    are answered `False` here rather than guarded at every call site.

    The direction test is on the **closing** bar of the pair: a bullish reversal is a fall
    answered by a green bar, whatever colour opened it. It is what makes one pair belong to one
    leg — without it every pair would be marked in both directions.
    """
    if i < 0 or i + 1 >= len(bars):
        return False

    first, second = shapes[i], shapes[i + 1]
    if first is None or second is None:
        return False

    if not adjacent(bars[i], bars[i + 1], timeframe):
        return False
    if first.bear == second.bear:
        return False
    if not second.agrees(direction):
        return False

    return (
        dominates(first, k)
        and dominates(second, k)
        and alike(bars[i], bars[i + 1], similarity)
        and expands(bars, i, expansion, timeframe)
    )


def marked_bars(
    bars: Sequence[Candle],
    shapes: Sequence[Shape | None],
    start: int,
    count: int,
    direction: Direction,
    rule: FormaRule,
    k: float,
    similarity: float,
    expansion: float,
    timeframe: Timeframe,
) -> list[LegBar]:
    """The marked bars of one leg — `count` bars of `bars` from `start`, in order.

    `start` and `count` name the leg's slice, but every measurement reads `bars` whole: that is
    the point of taking the global array rather than the slice. `at` counts from the leg's first
    bar, so it indexes the `LegWindow` this leg came from.

    A bar is a `two-bar` when it belongs to **any** matching pair — with the bar before it or the
    one after. A run of alternating bars therefore yields one entry per bar with contiguous `at`,
    rather than one per pair, which would show the same stretch of congestion several times over.

    The `or` cannot produce the same bar twice, and not by luck: a matching pair must *close* on
    the colour of the reversal, so `(i - 1, i)` matching makes bar `i` that colour, and `(i, i+1)`
    matching would make bar `i` the opposite one, since a pair's two bars differ in colour. No bar
    holds both. The direction filter is what makes the de-duplication free.
    """
    found: list[LegBar] = []

    for at in range(count):
        i = start + at
        shape = shapes[i]
        if shape is None:
            # No amplitude, so no proportions: neither filter has anything to read. Skipped in
            # silence — it is a real bar that traded at one price, not an error.
            continue

        pair = reverses(
            bars, shapes, i - 1, direction, k, similarity, expansion, timeframe
        ) or reverses(bars, shapes, i, direction, k, similarity, expansion, timeframe)

        if pair:
            found.append(LegBar.anchored(bars[i], at=at, type="two-bar"))
        if marks(rule, shape, direction):
            found.append(LegBar.anchored(bars[i], at=at, type="reversal-bar"))

    return found


class LegReversalsPattern(Pattern):
    """The two reversal filters, run over the bars of every leg.

    Three sources, and each is an **instance** rather than a producer key, for the reason
    `LegPattern` gives: passing the key as a string restates what `Pattern.producer` derives, and
    the two fall out of step as a `KeyError` at run time instead of an error at import.

    - `source` — the `LegWindowPattern` whose legs are read.
    - `pivots` — the `ZigZagPattern` those legs were cut at, for the direction of each leg's
      close. Nothing checks that it *is* the same detector `source` was built on; pointing it at
      another one raises on the first leg, which the route reports under `failed`.

    Declare it after both. There is no dependency graph, and the wrong order leaves the key absent
    from `ctx` with the reason only in the log.
    """

    def __init__(
        self,
        *,
        source: Pattern,
        pivots: Pattern,
        rule: FormaRule,
        k: float,
        similarity: float,
        expansion: float,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.pivots = pivots
        self.rule = rule
        self.k = k
        self.similarity = similarity
        self.expansion = expansion

    def run(self, ctx: Ctx) -> BaseSeries[LegReversals]:
        """One Point per leg, anchored where the leg is, holding the bars its filters marked.

        Anchors are the legs' own, untouched, so they are ordered exactly as `LegWindowPattern`
        left them and `BaseSeries` has nothing to object to.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        windows: BaseSeries[LegWindow] = ctx[self.source.producer]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]

        history = bars.points
        positions = bar_positions(history)
        # Measured once for the window, not once per leg: consecutive legs overlap, so a per-leg
        # pass would compute the same Shapes several times over.
        shapes = [shape_of(bar) for bar in history]
        turns = {pivot.time: pivot.direction for pivot in pivots.points}

        points = []
        for window in windows.points:
            close = window.bars[window.end]
            side = turns.get(close.time)
            if side is None:
                # The legs were cut at vertices this detector never produced, which means the two
                # sources disagree. Raising beats guessing a direction: a leg filtered for the
                # wrong side finds real bars of the wrong shape and looks entirely plausible.
                raise ValueError(
                    f"{self.pivots.producer} has no vertex at {close.time.isoformat()}, "
                    f"where a leg of {self.source.producer} closes"
                )

            # A leg that ends on a low is a fall that ended, and what turns a fall is a bullish
            # bar. The mirror on a high. This is the whole of the direction logic.
            direction: Direction = "bullish" if side == "low" else "bearish"

            found = marked_bars(
                history,
                shapes,
                position_of(window.bars[0], positions),
                len(window.bars),
                direction,
                self.rule,
                self.k,
                self.similarity,
                self.expansion,
                self.emits,
            )
            points.append(LegReversals.anchored(window, found=tuple(found)))

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
