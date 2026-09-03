"""The bars inside each leg that a reversal filter marks — the two-bar pair, the Forma rule, and
the inside bar.

`LegWindowPattern` hands over a leg and the bars it is made of. Nothing had yet looked *inside*
those bars. This does, with the filters this project has been studying in the browser:

- **The two-bar reversal** — two adjacent Candles, each with a body dominating its own shadows,
  in opposite colours, of comparable size, and large for the moment they happened in. `reverses`
  in `reversal_filters.py`.
- **The Forma rule** — one Candle whose proportions match a candidate rule from
  `docs/forma/rules.json`. `marks` in `shape.py`.
- **The inside bar** — one Candle whose range its predecessor already covered, both extremes
  included. `nests` in `reversal_filters.py`.

None of the three lives here any more, and the move is the point: they are claims about *bars*,
and `BarsPattern` asks the same three of every bar in the history rather than of a leg's slice.
What this module still owns is everything the word "leg" appears in — the slice, the one
direction that slice is a candidate for, and the Point they are packed into.

The three are a **union, not a composition**: this Pattern answers "which bars of this leg are
candidates for the turn", by any reading, and a bar satisfying two of them is listed once per
reading.

The first two never both hold, and by arithmetic rather than luck: `dominates` forces
`body >= k * wf`, and rule K wants `wf >= 0.49` with `body <= 0.35`, which together need
`k <= 0.714`. One describes a hammer and the other a bar whose body swallows its shadows.

**The inside bar carries no such exclusion, and is not meant to.** It reads only `high` and `low`,
so it says nothing about the body that the other two are arguing over, and it lands on the same bar
as either of them whenever the shape happens to coincide. A bar with two marks is two findings
about one bar, not a bug — and it is why nothing downstream may key a mark on `at` or `time` alone.

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

- **Candles with no amplitude are counted in the average** and are invisible to the two filters
  that read proportions, having none. They are *not* invisible to the inside bar: a bar that
  traded at one price sits inside whatever preceded it, trivially and truthfully, so it is marked.
  `/shapes` drops such bars before the bench sees them, so the two disagree by three bars in the
  `5m` history of `WIN@N` — immaterial in effect, real in principle.
- **Consecutive legs overlap** by `ahead + 1` bars, so a bar in a leg's tail is listed again as
  part of the next leg. That is a property of `LegWindow`, restated here rather than fixed: the
  question is what each leg contains, and a bar can be in two legs.
- **A chained run is not merged.** The TypeScript collapses `(1,2)` and `(2,3)` into one
  occurrence of three bars; here every bar of the run is listed once, in order, and the run is
  read off the contiguous `at` values. Same information, one item per bar.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction, FormaRule, Shape, marks, shape_of
from ..timeframes import Timeframe
from .leg_processor import bar_positions, position_of
from .leg_window import LegWindow
from .reversal_filters import MarkType, nests, reverses
from .zigzag import ZigZagPivot


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
    """One leg's marked bars, and which way the leg ran. Anchored on the leg's opening vertex,
    like `LegWindow` is.

    Carries the anchor, the list and the direction, and nothing else — not `since`, not `end`.
    Those are on the `LegWindow` Point at the same anchor, and restating them here would be two
    Series claiming the same fact.

    The direction is the exception, and earns it: nothing else in this Point says which way the
    leg ran, `found` cannot be read for it — a mark is a bar, not a move — and no other Series
    states it at all. Anything drawing `found` needs it to know which side of the price the marks
    belong on.
    """

    #: Empty when this leg produced nothing. Emitted anyway: an absent leg and a leg that matched
    #: nothing are different facts, and only one of them means the filter is too tight.
    found: tuple[LegBar, ...]
    #: The leg's **own** move: `bullish` when it closed on a high, `bearish` on a low.
    #:
    #: Deliberately *not* the direction the filters were run for, which is the opposite one — the
    #: bar that turns a fall is a bullish bar, so a `bearish` leg here holds bullish candidates.
    #: See `run`, where the two are named apart for exactly this reason.
    direction: Direction



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

    That argument is about the pair filter alone, and says nothing about `found` as a whole: an
    inside bar can and does land on a bar another filter also marked, so one `at` may appear more
    than once here, with a different `type` each time. Entries stay in `at` order, grouped by bar.
    """
    found: list[LegBar] = []

    for at in range(count):
        i = start + at

        # Above the shape guard on purpose: containment is read off `high` and `low`, so unlike
        # the two below it has something to say about a bar with no amplitude.
        if nests(bars, i, timeframe):
            found.append(LegBar.anchored(bars[i], at=at, type="inside-bar"))

        shape = shapes[i]
        if shape is None:
            # No amplitude, so no proportions: neither of the two shape-reading filters has
            # anything to read. Skipped in silence — it is a real bar that traded at one price,
            # not an error.
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

    name = "Reversal bars"

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

            # The leg's own move, which is what the Point reports and what a drawing of it needs.
            direction: Direction = "bullish" if side == "high" else "bearish"
            # And the turn it is a candidate for, which is the opposite one: a leg that ends on a
            # low is a fall that ended, and what turns a fall is a bullish bar. The mirror on a
            # high. This is the whole of the direction logic — the two are named apart because
            # they are never the same value, and a single `direction` invites reading one as the
            # other.
            reversal: Direction = "bearish" if side == "high" else "bullish"

            found = marked_bars(
                history,
                shapes,
                position_of(window.bars[0], positions),
                len(window.bars),
                reversal,
                self.rule,
                self.k,
                self.similarity,
                self.expansion,
                self.emits,
            )
            points.append(
                LegReversals.anchored(window, found=tuple(found), direction=direction)
            )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
