"""Where a leg ran into a line that held it — the join `leg-extremes` and `line-respect` never made.

Two questions are already answered separately. `leg_extremes.py` says how far each leg got;
`line_respect.py` says over which stretches a pinned line held. The question a reader of the monitor
actually has sits between them: **did this leg run into one of my lines and stop there?** Today that
is answered by eye, by lining a respect pill up against a leg on the chart.

This is that answer as a Series. For every closed simple leg, take the bar that made the leg's
extreme — the highest high of a leg that ran up, the lowest low of one that ran down — and ask
whether that bar is one of the bars of a respect group. Where it is, the leg reached a line and the
line held: a **target**.

The rules:

- **The extreme is `reach`**, the first of the three readings `extreme_points` names, taken over the
  leg's own bars. Not `close` and not `hold`: a target is where price *got to*, and the two others
  answer different questions. The tie rule comes with it — the earliest bar to make the level keeps
  it, so the answer is when the level was first achieved.
- **The direction is read, not derived.** It comes from the `LegMark` sitting on the bar the leg
  closes on, which is the same mark `split_legs` cut the leg at. A leg whose closing bar carries no
  mark means the legs and the marks came from different detectors, and that raises — see below.
- **Only the agreeing side counts.** A leg that ran up is stopped by a line its bars held from
  *below*; a leg that ran down, by one they held from *above*. A group on the far side is the line
  sitting behind price, which no reading makes a target. `AGREES` is that table.
- **One Point per (leg, line).** A leg's extreme can sit inside the groups of several lines at once,
  and each of those is a separate fact about a separate line. Nothing is folded into a list.
- **The last leg is not measured**, the `leg_extremes.py` rule and for the same reason:
  `SimpleLegPattern` gives the leg still running an endpoint on the newest bar, so its bars are
  redrawn by every close and its extreme — and therefore its target — moves with them. Dropping it
  settles the direction lookup too: `split_legs` folds the window's tail into the last leg *only*, so
  every other leg closes exactly on a mark and the lookup cannot miss.

What it deliberately does not do, and what that costs:

- **It does not read the bars.** A `Leg` carries its own bars and a `LineRespect` its own, so there is
  no window to index into and no `bar_positions` call here. The cost is that a leg and a group from
  two different Timeframes would be joined on `time` without complaint — which is the same trade
  every Pattern that reads only Series makes.
- **`LineRespect.side` answers for the group's anchor**, not for every bar in it: a group ends when
  price leaves the side it was holding, and a seam is the last bar of the group it closes. So the side
  filter here is a reading of how the group *ended*, and a leg whose extreme sits early in a long
  group is judged by that. Accepted rather than worked around — re-deriving a side per bar would be a
  second opinion about a group, living in the reader instead of in `line_respect.py`.
- **The first leg carries the window's head.** `split_legs` folds the bars before the first mark into
  the first leg, and those bars belong to a leg that was never emitted and ran the other way. So the
  first Point's `reach` can be taken from the wrong leg. A property of the source, restated rather
  than fixed — the same one `leg_extremes.py` accepts.
- **`start` and `end` are whole Candles**, so `to_dict` sends two bars per Point that are already on
  the wire twice over — inside their own `Leg`, and in the window's Series of Candles. Carried anyway
  because the leg is what a target is *about*, and a reader holding one row should not have to join
  back to `legs` to see which leg it names.
- **A boundary bar belongs to two legs**, so one candle can be the extreme of both and carry two
  target marks against one line. `BaseSeries` allows the shared anchor; a reader keying on `time`
  alone does not.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .leg_extremes import extreme_points
from .leg_processor import Leg
from .line_relations import Side
from .line_respect import LineRespect
from .simple_leg import LegMark


@dataclass(frozen=True, slots=True)
class LegTarget(Candle):
    """One leg's extreme, landing inside a stretch over which one line held.

    Anchored on the **extreme bar** — the bar this Point exists to name — so `time` is already the
    answer and needs no unwrapping. Not on the leg's opening vertex the way `LegExtremes` is: that
    one is a reading *of* a leg and belongs where the leg is, and this is a reading of a meeting,
    which happened on this bar.
    """

    #: The line's own id, unparsed. See `Line.id`.
    line: str
    #: The **line's** price, not the leg's. Carried for `LineRespect.price`'s reason: a reader checks
    #: the claim against `reach` beside it without going anywhere else.
    price: float
    #: Which side of the line the group held it from. Always `AGREES[direction]`, since that is the
    #: filter — carried rather than implied, so a row says which reading admitted it.
    side: Side
    #: The extreme the leg made: the `high` of a bull leg, the `low` of a bear one. The field flips
    #: with the direction and the role does not, the argument `LegPoint.price` makes.
    reach: float
    #: The leg's own move, read off the mark it closed on.
    direction: Direction
    #: The leg's first bar. `start.time` and `end.time` are the span this target is a fact about.
    start: Candle
    #: The leg's last bar — the mark it was cut at, since the last leg is never measured.
    end: Candle


#: Which side a group must have held the line from for a leg's extreme inside it to be a target.
#:
#: A table rather than a branch, the `_READINGS` precedent in `leg_extremes.py`: the bear reading is
#: visibly the mirror of the bull one and cannot drift from it. A leg that ran up and was stopped is
#: a leg whose bars stayed *below* the line, so the group's side is `below`.
AGREES: dict[Direction, Side] = {"bullish": "below", "bearish": "above"}


def _holders(respects: Sequence[LineRespect]) -> dict[datetime, list[LineRespect]]:
    """Each bar of every group, as a lookup from its `time` to the groups covering it.

    Built once rather than scanned per leg: the alternative is a pass over every group for every leg,
    and the question asked of it is always the same one — "which groups cover this bar".

    A bar can be in several, one per line, which is exactly the case that makes a leg emit more than
    one Point.
    """
    holding: dict[datetime, list[LineRespect]] = {}

    for group in respects:
        for bar in group.bars:
            holding.setdefault(bar.time, []).append(group)

    return holding


def leg_targets(
    legs: Sequence[Leg],
    marks: Sequence[LegMark],
    respects: Sequence[LineRespect],
) -> list[LegTarget]:
    """Every target in `legs`, in bar order.

    Plain sequences in and out, the `line_respects` and `split_legs` precedent: the rule knows
    nothing about Series, so its interface can change without the semantics moving underneath.

    **No sort**, unlike `line_respects`, which groups by line first and has to put its Points back in
    order. Here the anchors come out non-decreasing by themselves: leg `j` spans `marks[j]` to
    `marks[j + 1]`, so `extreme(j) <= end(j) == start(j + 1) <= extreme(j + 1)`. Several lines met by
    one leg share an anchor, which `BaseSeries` allows.

    Raises `ValueError` for a leg whose closing bar carries no mark — see the module docstring.
    """
    turns = {mark.time: mark.direction for mark in marks}
    holding = _holders(respects)

    found: list[LegTarget] = []

    # `[:-1]` drops the leg still running. No guard: an empty or single-leg list slices to nothing,
    # which is the right answer for both — one leg means that leg is the last one.
    for leg in legs[:-1]:
        close = leg.bars[-1]
        turn = turns.get(close.time)
        if turn is None:
            # The legs were cut at marks this Series never produced, which means the two sources
            # disagree. Raising beats guessing: a leg measured on the wrong side reports the extreme
            # of the other end of the move, and looks entirely plausible.
            raise ValueError(
                f"no leg mark at {close.time.isoformat()}, where a leg closes — "
                "the legs and the marks are from different detectors"
            )

        direction: Direction = "bullish" if turn == "high" else "bearish"
        # Only the first of the three readings: a target is how far the leg *reached*.
        reach = extreme_points(leg.bars, direction)[0]
        extreme = leg.bars[reach.at]

        for group in holding.get(extreme.time, ()):
            if group.side != AGREES[direction]:
                continue

            found.append(
                LegTarget.anchored(
                    extreme,
                    line=group.line,
                    price=group.price,
                    side=group.side,
                    reach=reach.price,
                    direction=direction,
                    start=leg.bars[0],
                    end=close,
                )
            )

    return found


class LegTargetPattern(Pattern):
    """`leg_targets` as a Pattern: the lines each closed leg reached and was held by.

    Three sources, all of them **instances** rather than producer keys — the reason `LegPattern`
    gives: a key written as a string restates what `Pattern.producer` derives, and the two fall out
    of step as a `KeyError` at run time instead of an error at import.

    - `source` — the slicer whose legs are measured. Its Points must carry `bars`.
    - `marks` — the detector `source` was cut at, and the only thing that says which way a leg ran.
      A `Leg` records no direction, which is why this is a second source and not a field.
    - `respects` — the groups to meet the legs against. Either `LineRespectPattern` instance does:
      this reads `line`, `price`, `side` and `bars`, and a respect group is the same shape whether it
      was held against a level or a sloped line.

    No dials. An extreme is an extreme, which side agrees is settled in `AGREES`, and the detector's
    own tuning belongs at the pipeline site.

    `name` is per-instance, the `LineRespectPattern` precedent: the pipeline holds two of these and a
    class attribute would put one label on two rows of a picker. It is derived from `respects`
    because that is the one source that differs between them.

    Declare it after all three sources. There is no dependency graph, and the wrong order leaves the
    key absent from `ctx` with the reason only in the log.
    """

    def __init__(
        self,
        *,
        source: Pattern,
        marks: Pattern,
        respects: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.marks = marks
        self.respects = respects
        self.name = f"Targets · {respects.name}"

    def run(self, ctx: Ctx) -> BaseSeries[LegTarget]:
        """One Point per closed leg and line it reached, anchored on the bar the leg's extreme made.

        The Candles of `emits` are never read: a leg carries its own bars and a group carries its
        own, and every question here is inside them. That is why this `run` has no `bar_positions`
        call — there is no index to translate.
        """
        legs: BaseSeries[Leg] = ctx[self.source.producer]
        marks: BaseSeries[LegMark] = ctx[self.marks.producer]
        respects: BaseSeries[LineRespect] = ctx[self.respects.producer]

        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            leg_targets(legs.points, marks.points, respects.points),
        )
