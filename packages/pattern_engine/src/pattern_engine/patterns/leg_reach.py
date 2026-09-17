"""Where each leg actually got to, as a pivot Series — the detector's vertices, repriced.

A detector's pivot is **not** its leg's extreme, and both of the ones here say so about themselves.
`simple_leg.py` is explicit: "`price` is the extreme of the **marked bar**, which is not always the
extreme of the leg" — its turn rule reads one side of the bar at a time, so a leg tops out and is
only marked several bars later, lower down. The zigzag is closer and still not exact: a bar becomes
a vertex candidate only where it made the rolling `depth`-window extreme, so a top that never
cleared its own trailing window is never a candidate and the cleanup elects a lower bar.

Anything measuring a *distance* between pivots therefore measures short. This Pattern is the repair
— one Point per source pivot, priced at the extreme its leg really reached — and everything that
wants honest prices reads this instead of the detector.

It is not a new rule. `trend_lines.py` needed exactly this and stated it as its fourth: "An
endpoint is where the leg got to, not where it was marked." That scan lives here now, as
`leg_reaches`, and `trend_lines.leg_ends` calls it. One copy, because two copies of a rule this
quiet drift apart in silence and nothing on either chart would show it.

The rule, for the pivot at `P[i]`:

- **The leg is `bars[pos(P[i-1]) .. pos(P[i])]`, inclusive at both ends** — `split_legs`' own
  definition of a leg, boundary bar shared and all.
- **The reach is the extreme over it on `P[i]`'s own side**: the highest `high` for a top, the
  lowest `low` for a bottom. Ties keep the earliest bar, so the answer is where the level was first
  achieved. Both of those come from `extreme_points`, which is where the tie rule and the direction
  table are already written and tested; only the first of its three readings, `reach`, is wanted.
- **`P[0]` takes the window head**, the same fold `split_legs` makes: its leg opened before the
  window, so its reach is the best of what the window happens to show.

Three properties, stated because they are what make this safe to put underneath a Pattern that
measures pivots against each other:

- **One Point per source pivot, in the source's order.** Index `i` answers about pivot `i`, so a
  reader can hold the two Series side by side, and a Pattern reading this one needs no changes at
  all against reading the detector directly.
- **Anchors never go backwards.** A reach sits at or before its own pivot's bar and at or after the
  previous pivot's, so `reach(i) <= pos(i) <= reach(i + 1)`. `trend_lines` already leans on this
  property to keep its fan's anchors ordered.
- **A pivot can only move outward** — a top's price can only rise and a bottom's only fall, since
  the scan includes the pivot's own bar. So two adjacent opposite-side reaches cannot cross: their
  legs share a boundary bar, and `max high >= high(shared) >= low(shared) >= min low`. The Series
  this emits is better formed than the one it read, never worse.

What it deliberately does not do, and what that costs:

- **No tail**, unlike `leg-extremes`, which scans `ahead` bars past the close and accepts a reach
  sitting past the leg it measures. A tail would overlap the next leg's span, and then two pivots
  scanning one stretch of bars can come back in the wrong order — the ordering property above is
  exactly what the omission buys. The cost is real: a leg exceeded a bar or two *after* it was
  marked keeps the lower price, and that is information this Series does not carry. A reader who
  wants it has `leg-extremes`, which does look ahead and says so.
- **It does not move the detector's vertex.** `simple_leg.py` refuses to reprice its own marks on
  purpose — it would be "a second opinion about where a leg ends, living in the adapter instead of
  in the rule" — and that refusal is respected here: this is a separate Series, downstream, that a
  pipeline opts into. The cost is two Series that disagree about where the same leg ended, on
  screen at once, and nothing but their names to tell a reader which is which.
- **`provisional` is read positionally**, from the last Point of the source, rather than from the
  source's own flag. One rule for both detectors, because `ZigZagPivot` has no such field at all —
  the same trade `RetracementPattern` makes and for the same reason. It is conservative: when
  `simple-leg`'s newest bar carries a settled mark it emits no provisional Point, and this flags a
  genuinely closed leg anyway.
- **Two Points can share a bar**, where two legs reached their extreme on one candle — a spike
  that both closed one leg and opened the next. `BaseSeries` allows it, raising only on anchors that
  decrease, but `as_of` on this Series answers "which leg reached last", not "which leg is running".
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
from .simple_leg import LegMark
from .zigzag import ZigZagPivot


@dataclass(frozen=True, slots=True)
class LegReach(Pivot):
    """Where one leg reached: the bar that made the extreme, and which extreme it is.

    Not the vertex. A `LegMark` or a `ZigZagPivot` says *which* leg ended and on which side; this
    says *where that leg got to*, which is a different bar whenever the detector marked the turn
    late — see the module docstring. The pivot it came from is not carried: the detector's Series
    is where the vertices live, and restating one here would be two Series claiming the same fact.

    Field for field a `LegMark`, and deliberately a type of its own rather than that one reused: a
    Point that says it is a mark, when it is a reading *of* a mark, is the confusion this whole
    module exists to end.
    """

    #: Which extreme this is, in `Pivot`'s vocabulary — the side of the pivot whose leg it
    #: measures.
    direction: Literal["high", "low"]
    #: True for the **last** Point only: it measures the source's newest pivot, and that pivot is
    #: unsettled on both detectors, so this leg's extreme moves with every bar. Positional rather
    #: than copied from the source — see the module docstring for the cost.
    provisional: bool


#: Any Pivot that also names which extreme of its bar it is.
#:
#: Lives here rather than in `retracement.py`, which used to own it: this is the module that takes
#: one from any detector, and the third member is this module's **own** output. Scanning a reach
#: Series a second time is a no-op, which is the honest reading of a type that includes itself.
#:
#: A union of the concrete types rather than a Protocol, which this package uses nowhere.
#: `direction` lives on each subclass and not on `Pivot`, so there is no base type to name. The
#: union fails at type-check the day a fourth sided pivot lands — which is exactly when a shared
#: contract is worth promoting, rather than guessing at its shape now.
type SidedPivot = ZigZagPivot | LegMark | LegReach


def leg_reaches(bars: Sequence[Candle], pivots: Sequence[SidedPivot]) -> list[tuple[int, float]]:
    """Each pivot as the position and price of the bar its leg actually reached.

    Bare pairs rather than Points, because the two callers build different ones and disagree about
    exactly one field: `trend_lines` reads each mark's own `provisional`, and the Pattern below
    cannot, since a `ZigZagPivot` has none. Everything they agree about is here, once.

    Positions come back alongside the prices because everything downstream of the trend-line caller
    is index work, and looking a bar up twice by `time` would be the same dictionary hit written in
    two places.

    Raises `ValueError` through `position_of` for a pivot that sits on no bar of `bars` — the
    mismatched-Timeframe guard, shared rather than rewritten.
    """
    positions = bar_positions(bars)

    reaches: list[tuple[int, float]] = []
    opened = 0

    for pivot in pivots:
        at = position_of(pivot, positions)
        leg = bars[opened : at + 1]
        # `reach` — how far the leg went — read on the leg's own side: a top closes a leg that
        # ran up, a bottom one that ran down.
        found = extreme_points(leg, "bullish" if pivot.direction == "high" else "bearish")[0]
        reaches.append((opened + found.at, found.price))
        opened = at

    return reaches


class LegReachPattern(Pattern):
    """`leg_reaches` as a Pattern: one detector's pivots, repriced at the extremes their legs made.

    `source` is the detector's **instance**, not its producer key — the reason `LegPattern` gives:
    a key written as a string restates what `Pattern.producer` derives, and the two fall out of
    step as a `KeyError` at run time instead of an error at import.

    It takes either detector, which is the whole point: the marked-bar problem is `simple-leg`'s
    loudly and the zigzag's quietly, and one Pattern answering both is what lets two chains be
    compared. No dials — an extreme is an extreme, and the detector's own tuning belongs at the
    pipeline site.

    `name` is per-instance rather than a class attribute, the `LegExtremesPattern` precedent: one
    class instantiated twice would otherwise put one label on two rows of a sidebar. It is short
    because it is read *through* whatever consumes this Series — `Retracement · Reach · Zig-zag`
    is a chain of three and each link has to earn its width.

    Declare it after its source. There is no dependency graph, and the wrong order leaves the key
    absent from `ctx` with the reason only in the log.
    """

    def __init__(self, *, source: Pattern, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.name = f"Reach · {source.name}"

    def run(self, ctx: Ctx) -> BaseSeries[LegReach]:
        """One Point per source pivot, anchored on the bar its leg reached rather than on the pivot.

        Both the bars and the source Series are read — where a leg reached is a fact about the
        leg's candles, and no pivot Series carries it. The anchors move, and they stay
        non-decreasing while they do, for the reason the module docstring gives.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        pivots: BaseSeries[SidedPivot] = ctx[self.source.producer]

        last = len(pivots) - 1
        points = [
            LegReach.anchored(
                bars[at],
                price=price,
                direction=pivot.direction,
                provisional=index == last,
            )
            for index, (pivot, (at, price)) in enumerate(
                zip(pivots.points, leg_reaches(bars.points, pivots.points))
            )
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
