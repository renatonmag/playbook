"""The bars of each leg — the step after a detector has named the vertices.

`ZigZagPattern` and `SimpleLegPattern` answer *where* a leg turned; neither answers *which bars
it is made of*. `split_legs` is that answer: hand it the window's Candles and any Series of
Pivots, and it hands back one list of Candles per leg. `LegPattern` at the bottom is the adapter
that makes it a Pattern — the same split `zigzag.py` and `simple_leg.py` use, and for the same
reason: the algorithm knows nothing about Series, so its interface can change without the
semantics moving underneath.

Five rules carry the whole thing:

- A Pivot is found in the window by its `time`. Equality is not an option: `Candle` is a
  `slots`/`frozen` dataclass, so the generated `__eq__` demands `other.__class__ is
  self.__class__`, and `ZigZagPivot` is not `Candle` — `pivot == bar` is `False` even when
  `anchored` copied all six fields off that very bar. A Pivot whose `time` is not in the window
  raises, because a pipeline that pairs a `5m` detector with a `15m` slicer is built wrong and
  the alternative is one enormous leg silently spanning the vertex that went missing.
- A leg runs from one Pivot to the next, **inclusive at both ends**. The boundary bar closes one
  leg and opens the next, so it appears in both — a leg is the segment between two extremes, and
  a segment contains its endpoints.
- The bars before the first Pivot join the first leg; the bars after the last Pivot join the
  last. Nothing in the window is dropped.
- Fewer than two Pivots is not a leg. Zero yields nothing at all; one yields the whole window,
  since the single vertex names no pair to run between.
- `Leg` anchors on its **first** bar. An interval is identified by where it begins, which is
  what makes `as_of` answer "which leg is running now" rather than "which leg last closed".

What that costs, stated rather than hidden:

- The first and last `Leg` carry the head and tail, so their `bars[0]`/`bars[-1]` are not
  Pivots. Direction and amplitude read off the endpoints hold only for the legs in between, and
  nothing on the `Leg` says which those are.
- Worse than merely partial: those attached bars belong to the *neighbouring legs that were
  never emitted*, which run the opposite way. A `high`/`low` taken over the first or last
  `leg.bars` mixes two legs together.
- The OHLCV a `Leg` inherits from `Candle` is the anchor bar's and says nothing about the leg.
  The leg is `bars`.
- `to_dict` recurses into `bars`, so every bar is serialized roughly three times — inside its
  leg, again as some leg's anchor, and again in the window's own Series of Candles.
- Boundary bars belong to two legs, so `sum(len(leg.bars))` is not the number of bars.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle, Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe


def split_legs(bars: Sequence[Candle], pivots: Sequence[Pivot]) -> list[list[Candle]]:
    """The Candles of each leg, one list per leg, in order.

    Legs overlap by exactly one bar: `legs[i][-1] is legs[i + 1][0]`, the Pivot that closes one
    and opens the other. The head and tail of the window are folded into the first and last leg,
    so every Candle handed in comes back in at least one leg.

    Raises `ValueError` for a Pivot that does not sit on a bar of `bars`.
    """
    positions = bar_positions(bars)
    marks = [position_of(pivot, positions) for pivot in pivots]

    if not marks:
        return []
    if len(marks) == 1:
        return [list(bars)]

    # `+ 1` because the boundary bar closes this leg, and the next leg starts back at it rather
    # than one past it — the two ranges deliberately overlap by that single bar.
    legs = [list(bars[start : end + 1]) for start, end in zip(marks, marks[1:])]
    legs[0][:0] = bars[: marks[0]]
    legs[-1].extend(bars[marks[-1] + 1 :])
    return legs


def bar_positions(bars: Sequence[Candle]) -> dict[datetime, int]:
    """The window as a lookup: each bar's `time` to its index.

    Built once and handed to `position_of` repeatedly, because a slicer locates several things
    in one window — the vertices, and, in `leg_window.py`, the bar each vertex says its leg
    turned on.
    """
    return {bar.time: index for index, bar in enumerate(bars)}


def position_of(bar: Candle, positions: dict[datetime, int]) -> int:
    """Where a bar sits in the window, by `time`.

    Takes a `Candle`, not a `Pivot`: `leg_window.py` looks up `ZigZagPivot.since`, which is a
    plain bar of the window and not a vertex at all. Only `.time` is ever read.

    An orphan means the detector and the slicer were pointed at different Timeframes — nothing
    validates that, since `reads`/`emits` carry no guarantee. Raising beats skipping: a skipped
    vertex produces a leg that runs straight through it, which is wrong and looks entirely
    plausible. Shared rather than written twice, for the same reason: what a mismatched pipeline
    *does* is a decision, and a decision written twice drifts apart in silence.
    """
    try:
        return positions[bar.time]
    except KeyError:
        raise ValueError(
            f"the bar at {bar.time} sits on no bar of this window — "
            "the pivots and the bars are from different Timeframes"
        ) from None


@dataclass(frozen=True, slots=True)
class Leg(Candle):
    """One leg: the Candles it is made of, anchored on the first of them.

    No `since` and no `direction`. `bars[0]` already says where the leg began, and the direction
    follows from comparing the two ends — for the legs that have Pivots at both ends. See the
    module docstring for the two that do not.
    """

    bars: tuple[Candle, ...]


class LegPattern(Pattern):
    """`split_legs` as a Pattern: a Series of the legs a detector's vertices carve out.

    `source` is the detector's **instance**, not its producer key — the same object the pipeline
    list already holds. Passing the key as a string means restating what `Pattern.producer`
    derives, and a `depth` changed in one place and not the other fails as a `KeyError` at run
    time instead of at import.

    It reads any `BaseSeries[Pivot]`, so `ZigZagPattern` and `SimpleLegPattern` are
    interchangeable here; a `ZigZagPivot`'s `since` is not consulted. Declare it *after* its
    source: there is no dependency graph, and the wrong order leaves the key simply absent from
    `ctx` with the reason only in the log.
    """

    def __init__(
        self, *, source: Pattern, reads: tuple[Timeframe, ...], emits: Timeframe
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        # An instance attribute where every other Pattern uses a class one, because the pipeline
        # holds two of these — one per detector — and a fixed string would label both Series the
        # same. What tells them apart is exactly what tells the two runs apart: the source.
        self.name = f"Legs · {source.name}"

    def run(self, ctx: Ctx) -> BaseSeries[Leg]:
        """Slice `emits`' Candles at `source`'s vertices and pack one Point per leg.

        Anchoring on `leg[0]` also keeps the Points ordered for free: legs start at successive
        Pivots, so their anchors strictly increase and `BaseSeries` has nothing to object to.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        pivots: BaseSeries[Pivot] = ctx[self.source.producer]

        points = [
            Leg.anchored(leg[0], bars=tuple(leg)) for leg in split_legs(bars.points, pivots.points)
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
