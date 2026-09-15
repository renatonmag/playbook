"""The general direction — which way the market is leaning, read off the simple legs' pivots.

Every Pattern below `simple-leg` answers about one leg at a time. This one holds an opinion that
*survives* legs: a trend, `bullish` or `bearish`, seeded once and then defended until the pivots
break it twice. The output is only the turns — one Point where the opinion was first formed and
one wherever it changed — so the trend at any bar is the direction of the last Point at or before
it.

**The seed** is the first pair of same-side inflexions that agrees: two descending highs read
bearish, two ascending lows read bullish, and whichever pair completes first wins. Like
`PbMark.detect_initial_direction`, this is an assumption applied early, not a measurement — the
first inflexion of each side only primes the comparison. Equal prices do not agree: a level
retested is a level held, not a slope.

**The first mark of the Series is not an inflexion** and is dropped before any of that. An
inflexion is where a leg *ends*, and the first mark is where the first visible leg *begins* — the
window opens mid-leg, so the turn that would have marked its start is not there to be read. Left
in, it pairs with the third mark and hands the seed to the wrong side one inflexion early.

**A flip takes two breakouts** by the opposite side's marks. In a bearish trend, watching highs:

1. a high mark above the *chronologically previous* high mark — the immediate structure bending;
2. a later high mark above **the standing breakout's own high** — the crack widening instead of
   closing.

So a breakout sets the level the next threat has to clear, and nothing else is a ceiling. In
particular the trend's earlier highs are not: the question being asked is whether the break that
started is carrying on, not whether the whole move has been retraced.

**The standing breakout is the latest one, not the first.** A high that fails to clear the level
but is itself a breakout — it is still above the chronologically previous high — takes the level's
place, and the next threat is measured against *it*. Test one and test two are the same test asked
of different references, which is why there is one place below where a breakout is registered. A
high that beats nothing at all is not a breakout and changes nothing: the standing crack survives
it, until the trend repairs it (below) or the flip lands. A bullish trend is the vertical mirror
throughout, watching lows.

**The guard** is how the trend repairs a breakout. When a breakout is registered — the first, or
one replacing it — the extreme of the zigzag leg then in progress is registered with it — the latest `zig-zag` pivot on the *trend's own*
side, a high in a bullish trend, a low in a bearish one. A trend-side mark printing strictly past
that level afterwards discards the breakout: the market went beyond the leg the breakout
interrupted, so the trend reasserted itself and the crack is repaired. A breakout then has to
happen again from scratch. The guard moves with the level and is read at the same instant, so the
two always describe the same crack rather than two different moments. The zigzag is a second source, not a convenience — the simple legs
are too noisy to say where "the current leg" began, which is exactly what `depth=8` smoothing is
for. No pivot seen yet means no guard and no repair.

What it costs, stated rather than hidden:

- **"Chronologically previous" ignores trend boundaries.** Right after a flip, breakout one is
  judged against the last opposite-side mark of the *old* trend. That is one total rule instead
  of a carve-out, and it makes immediate re-flips conservative — the old trend's structure has to
  actually be taken out.
- **The level walks toward price, never away from it.** Each new crack replaces the standing
  one, so a grind of failing highs that keep taking out the high before them lowers the ceiling
  step by step, and the flip lands on the mark that broke the *recent* structure rather than on
  the one that finally cleared a crack from hours ago. The cost is a trend that turns sooner and
  more often — a long enough drift will always assemble two breakouts eventually. What is *not*
  paid: an attempt that beats nothing leaves the level exactly where it was, so a single wild
  mark cannot walk the ceiling down on its own, and the level is never raised away from price to
  the highest attempt, which would make each failure make the next one harder.
- **A trend's own establishing pivot is not a ceiling.** The seed and the flip both set no level
  at all, so what a trend has to clear is only ever what a first breakout put there. A trend
  seeded on a very high pivot is no harder to break than one seeded on a low one, which is the
  point: how far the old move ran says nothing about whether the new break is carrying on.
- **The opening mark is excluded from everything**, not just from the seed: it is never the
  "chronologically previous" high or low a later breakout is judged against either. It is not an
  inflexion, so it is a reference for nothing. And since which mark opens the Series is a property
  of where the window starts, so is the seed — a window opening one leg earlier reads a different
  first inflexion, and can settle on a different direction.
- **The provisional mark counts**, so the reading is current with the newest bar and
  **repaints**. `simple-leg`'s last Point is the leg still in formation, and it moves with every
  bar; a turn decided by it can shift to another bar, or vanish outright, when that leg finally
  closes somewhere else. Nothing in the output says which turn that is — the Series is turns and
  nothing else, and a flag on one would be a second opinion about how far to trust it. The trade
  is deliberate: the alternative is a reading one settled leg behind, which never repaints and
  never reports the turn happening now.
- **Merged marks are survived, not assumed away.** `simple-leg` normally alternates sides, but
  two marks can collapse onto one bar; every reference here is per-side, so two consecutive
  same-side marks compare against each other and nothing double-counts.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Pivot
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .simple_leg import LegMark, integer
from .zigzag import ZigZagPivot

#: How the trend was established at this Point: assumed from the first agreeing pair, or won by
#: two breakouts against the trend before it.
Kind = Literal["seed", "flip"]

#: Which trend two agreeing marks of one side seed. Descending highs are a market making lower
#: ceilings; ascending lows, higher floors.
_SEEDS: dict[Literal["high", "low"], Direction] = {"high": "bearish", "low": "bullish"}

#: How a second same-side mark must compare with the one before it for the pair to agree.
#: Strict, like every comparison here — a retest is not a slope. The bear side is the vertical
#: mirror of the bull one, the form `advancing_legs._READINGS` uses.
_AGREES: dict[Literal["high", "low"], Callable[[int, int], bool]] = {
    "high": lambda current, previous: current < previous,
    "low": lambda current, previous: current > previous,
}

#: While trending this way, which side's marks threaten the trend, and how a threatening price
#: beats a reference. One comparator serves all three questions asked here: the flip test against
#: the standing breakout's level, the breakout test against the previous mark of its side — which
#: registers the first crack and every replacement alike — and, read through `_FLIPS`, which turns
#: the table around, the guard's repair test.
_WATCH: dict[Direction, tuple[Literal["high", "low"], Callable[[int, int], bool]]] = {
    "bearish": ("high", lambda candidate, reference: candidate > reference),
    "bullish": ("low", lambda candidate, reference: candidate < reference),
}

#: What a flip flips to — and, read through `_WATCH`, where a trend's *own* side is watched: the
#: trend's own side is the opposite trend's threat side, compared the same way.
_FLIPS: dict[Direction, Direction] = {"bearish": "bullish", "bullish": "bearish"}


def general_direction(
    marks: Sequence[LegMark], pivots: Sequence[ZigZagPivot]
) -> list[tuple[LegMark, Direction, Kind]]:
    """Every turn of the general direction: `(deciding mark, new direction, kind)`, in order.

    `marks` are the settled simple-leg pivots and `pivots` the zigzag vertices, both ascending by
    `time` as their Series deliver them — the walk merges the two on time rather than looking
    anything up, so a zigzag pivot counts for the guard once the marks pass it. Takes Points
    rather than Series, like every rule in this package: it knows nothing about identity, and the
    adapter below is where a Series is made.

    **`marks[0]` is skipped**: it opens the first leg rather than ending one, so it is not an
    inflexion and is a reference for nothing. See the module docstring.

    Empty when no pair of inflexions ever agrees, `pivots` or not — the guard refines an
    established trend and can seed nothing.
    """
    events: list[tuple[LegMark, Direction, Kind]] = []

    #: The latest mark of each side, updated for both sides through every phase — this is what
    #: "the chronologically previous high" means, trend boundaries and all.
    last: dict[Literal["high", "low"], LegMark] = {}
    #: The latest zigzag pivot price of each side, scaled, as far as the walk has merged.
    latest: dict[Literal["high", "low"], int | None] = {"high": None, "low": None}
    merged = 0

    direction: Direction | None = None
    #: The price the standing breakout printed — what the next threat has to clear. `None` is
    #: "no breakout standing", so this doubles as the count and there is no separate counter to
    #: keep in step with it. It is the *latest* crack, not the first: see the module docstring.
    level: int | None = None
    #: The extreme of the zigzag leg the standing breakout interrupted. Moves and clears with
    #: `level`, and is `None` on its own when the zigzag had said nothing yet.
    guard: int | None = None

    for mark in marks[1:]:
        while merged < len(pivots) and pivots[merged].time <= mark.time:
            latest[pivots[merged].direction] = integer(pivots[merged].price)
            merged += 1

        previous = last.get(mark.direction)
        last[mark.direction] = mark
        value = integer(mark.price)

        if direction is None:
            if previous is not None and _AGREES[mark.direction](value, integer(previous.price)):
                direction = _SEEDS[mark.direction]
                events.append((mark, direction, "seed"))
                # No level: a trend has to clear only what a first breakout puts there, and its
                # own establishing pivot is not a ceiling. See the module docstring.
            continue

        side, beats = _WATCH[direction]

        if mark.direction != side:
            # A trend-side mark. The only thing it can do is repair a standing breakout by
            # printing past the guard; a trend never re-proves itself otherwise.
            _, reasserts = _WATCH[_FLIPS[direction]]
            if level is not None and guard is not None and reasserts(value, guard):
                level = guard = None
            continue

        if level is not None and beats(value, level):
            # The crack widening past where it stands: the flip. `continue` rather than falling
            # through, or this mark would go on to register a breakout of the trend it has just
            # started — judged, absurdly, with the comparator of the trend it ended.
            direction = _FLIPS[direction]
            events.append((mark, direction, "flip"))
            level = guard = None
            continue

        if previous is not None and beats(value, integer(previous.price)):
            # A crack: the first one, or a later one that failed to clear the standing level and
            # takes its place. One test and one registration for both, because they are the same
            # question asked of the same reference — the previous mark of this side.
            #
            # It sets the level the next threat has to clear, plus the level the *trend* has to
            # clear to repair it: the extreme of the zigzag leg this interrupted, read as the
            # latest trend-side vertex. Re-read on a replacement, so the guard never describes an
            # older crack than the level does. `None` when the zigzag has said nothing yet, and
            # then there is no repair.
            level = value
            guard = latest[_WATCH[_FLIPS[direction]][0]]

    return events


@dataclass(frozen=True, slots=True)
class GeneralDirection(Pivot):
    """One turn of the general direction, anchored on the mark that decided it.

    `price` is the deciding mark's own — the level whose breach (or agreement) turned the
    reading. The direction holds from this bar until the next Point of the Series; there is no
    Point per bar, deliberately, because a trend is one fact over many bars and restating it on
    each would be a column pretending to be a Series.
    """

    #: The trend from this bar on — not the trend that just ended.
    direction: Direction
    #: `"seed"` for the first Point only, ever: the pair-agreement assumption. Every later turn
    #: is a `"flip"`, earned by two breakouts.
    kind: Kind


class GeneralDirectionPattern(Pattern):
    """`general_direction` as a Pattern: the turns of the market's general lean.

    Two sources, each an **instance** rather than a producer key, for the reason `LegPattern`
    gives: a string restates what `Pattern.producer` derives, and the two fall out of step as a
    `KeyError` at run time instead of an error at import.

    - `source` — the `SimpleLegPattern` whose marks are the pivots being counted, the
      provisional last one included.
    - `pivots` — the `ZigZagPattern` that names the guard level: the extreme of the leg a first
      breakout interrupted. The same second source, for the same smoothing, that
      `AdvancingLegsPattern` takes.

    No dials. The two-breakout count, the strictness of every comparison and the guard rule are
    all settled in the module docstring, and both sources are tuned at the pipeline site.

    Declare it after both sources. There is no dependency graph, and the wrong order leaves the
    key absent from `ctx` with the reason only in the log.
    """

    name = "General direction"

    def __init__(
        self,
        *,
        source: Pattern,
        pivots: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.pivots = pivots

    def run(self, ctx: Ctx) -> BaseSeries[GeneralDirection]:
        """One Point per turn, anchored on the deciding mark's bar with that mark's price.

        Every mark of `source` reaches the rule, the provisional last one included: the leg in
        formation is an inflexion like any other, and holding it back is what kept the reading a
        settled leg behind the newest bar. The cost is stated in the module docstring — the
        newest turn repaints, and the Series does not say so.

        No cross-Series anchor to resolve, so no lookup to fail: the deciding mark *is* a bar,
        and `anchored` copies it. The Candles of `emits` are never read.
        """
        marks: BaseSeries[LegMark] = ctx[self.source.producer]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]

        points = [
            GeneralDirection.anchored(mark, price=mark.price, direction=direction, kind=kind)
            for mark, direction, kind in general_direction(marks.points, pivots.points)
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
