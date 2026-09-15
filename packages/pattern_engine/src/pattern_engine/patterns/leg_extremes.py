"""Where each leg actually got to — the three bars that define its turn.

`LegReversalsPattern` looks inside a leg's bars for candidate turn bars, by shape. This answers
the simpler, prior question that one assumes: **how far did this leg go?** A leg has three
defensible answers, and they are usually three different bars.

```
                     bull leg          bear leg
how far it reached   highest high      lowest low
how far it closed    highest close     lowest close
what it fully held   highest low       lowest high
```

The spike high and the highest close are not the same bar, and neither is the highest bar low —
the highest level price never traded back below, which is the one of the three a stop can sit
under. Naming all three is the point: everything downstream that measures a leg, places a level
or asks whether a break was real means *one* of them, and today each caller would re-derive it,
with a direction-dependent field lookup, from the raw bars.

The rules:

- **The whole of a leg's `bars` is scanned, tail included.** For a `LegWindow` that is the same
  span `LegReversalsPattern` reads, so the two Patterns disagree about no bar, and the tail matters
  for its own reason besides: a leg that is exceeded a bar or two *after* its vertex is a fact, and
  hiding it behind the slicing would be a claim that it did not happen. A leg with no tail — an
  `AdvancingLeg` is exactly its own bars — is simply a leg where the two spans coincide.
- **Ties keep the earliest bar.** The comparison is strict, so the first bar to reach a level
  keeps it — `max` semantics, and the reading is "when the level was achieved".
- **The direction comes from the leg**, and there are two ways a leg can say so. A `LegWindow`
  cannot: it anchors on its opening vertex and does not say which extreme its closing vertex is,
  which is why the pivots are a second input for that source. A leg that already carries its own
  `direction` — an `AdvancingLeg` does, read off the mark it opens on — needs no second input, and
  the Pattern takes none.
- **No mirror**, unlike `leg_reversals.py`, which filters a leg for the *opposite* direction to
  its own. Here the leg's own direction is both what is measured and what is reported, and there
  is no second value to confuse it with.
- **The last leg is not measured**, whatever the source. On `leg-windows` it closes on the newest
  zigzag vertex, and that vertex is provisional: `_cleanup_extremes` moves it as soon as price
  makes a further extreme, taking the leg's direction and all three of its levels with it. Its
  window is the wrong shape too — the last one swallows every remaining bar as its tail rather
  than `ahead` of them, so its `reach` is drawn from an unbounded stretch of the leg still forming
  and is not comparable with any other leg's. On `advancing-legs` the reason is `SimpleLegPattern`
  giving the leg still running an endpoint on the newest bar, so its bars are redrawn by every
  close. A leg is measured here once it is over, and the last one is not.

What it costs, stated rather than hidden:

- **The reach can sit past the close.** Scanning the tail means a leg whose successor opened
  beyond it reports a `reach` with `at > end`. Read that as "the level was exceeded after the
  turn" — it is information, and it is why `reach` must never be read as "the closing vertex".
  The vertex is `bars[end]`, and `LegWindow` already says so. The tail it can sit in is now
  always a bounded one, `ahead` bars long, since the leg with the unbounded tail is the one
  skipped.
- **One fewer Point than the source**, and the two Series no longer line up index for index.
  The legs here are a *prefix* of the source's, so anything reading both must join on the anchor
  `time` — which is the same on both, this Pattern anchoring each Point exactly where its leg was
  anchored — and never by position. `as_of` is unaffected and still answers "which leg is running now", except that the
  answer goes quiet for the newest leg until the one after it opens.
- **Consecutive legs can overlap** — by `ahead + 1` bars on `leg-windows`, and by the single
  shared mark on `advancing-legs` — so one bar can be a defining point of two legs. A property of
  the source, restated here rather than fixed: the question is what each leg reached, and a bar can
  be in two legs.
- **The drop of the last leg reads differently on a flat source.** `advancing-legs` runs its groups
  end to end, so the leg sorting last is the one still forming only when `trim_tail` and the advance
  filter both spared it; otherwise a closed leg goes unmeasured. Accepted, for the reason above —
  the alternative is reporting three levels that move on every close.
- **The three can land on one bar.** A one-bar move, or a bar that both spiked and closed at the
  extreme, yields three points with the same `at` and a different `type` each. Key a point on
  `at` *and* `type`, never on `at` or `time` alone — the same rule `LegBar` carries.
- **The OHLCV inherited from `Candle`** is the leg's anchor bar's, as on `LegWindow`, and says
  nothing about any of the three points. Those are in `found`.
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .zigzag import ZigZagPivot

#: Which of a leg's three defining levels a point is.
#:
#: Named for the **role**, not for the OHLC field, because the field flips with the leg's
#: direction and the role does not: `reach` is the high of a bull leg and the low of a bear one,
#: and code that wants "how far it went" should not have to branch to ask.
ExtremeType = Literal["reach", "close", "hold"]


@dataclass(frozen=True, slots=True)
class LegPoint(Candle):
    """One of a leg's three defining bars.

    Not a Series Point: these live in the `found` list of a `LegExtremes`, so `time` here is not
    an anchor, just the bar's own — and it is the field this Pattern exists to produce, the
    timestamp to look up on the real chart.
    """

    #: Where the bar sits in `bars` of the `LegWindow` this leg came from. Only meaningful
    #: alongside that leg, which is why the two travel together.
    at: int
    type: ExtremeType
    #: The value that won — `high`, `close` or `low` on a bull leg, mirrored on a bear one.
    #: Carried so that no caller re-derives which field to read from `direction`; the same
    #: argument `Pivot` makes for its own `price`.
    price: float


@dataclass(frozen=True, slots=True)
class LegExtremes(Candle):
    """One leg's three defining points, and which way the leg ran. Anchored on the leg's opening
    vertex, like `LegWindow` is.

    Carries those two and nothing else — not `since`, not `end`, not `bars`. Those are on the
    `LegWindow` Point at the same anchor, and restating them here would be two Series claiming
    the same fact.
    """

    #: **Always exactly three**, in the fixed order `reach`, `close`, `hold`.
    #:
    #: Role order rather than `at` order, unlike `LegReversals.found`: there the count varies and
    #: the bar is the only thing to sort by, here the three are known and each is asked for by
    #: name. The three may share a bar or occupy three, and either is ordinary.
    found: tuple[LegPoint, ...]
    #: The leg's **own** move: `bullish` when it closed on a high, `bearish` on a low. The same
    #: direction the three points were measured for — there is no mirror here, unlike
    #: `LegReversals`, whose `found` holds candidates for the *opposite* turn.
    direction: Direction


#: The three readings, per direction: which field each role is, and how two of them compare.
#:
#: A table rather than a branch inside the loop, so the bear side is visibly the vertical mirror
#: of the bull one and cannot drift from it. `reach` and `hold` swap; `close` is `close` on both.
_READINGS: dict[Direction, tuple[tuple[ExtremeType, Callable[[Candle], float]], ...]] = {
    "bullish": (
        ("reach", lambda bar: bar.high),
        ("close", lambda bar: bar.close),
        ("hold", lambda bar: bar.low),
    ),
    "bearish": (
        ("reach", lambda bar: bar.low),
        ("close", lambda bar: bar.close),
        ("hold", lambda bar: bar.high),
    ),
}


def _best(
    bars: Sequence[Candle], value: Callable[[Candle], float], higher: bool
) -> tuple[int, float]:
    """The winning bar's index and its value, over a non-empty `bars`.

    The comparison is **strict**, which is the whole of the tie rule: a later bar equalling the
    best does not displace it, so the answer is the first bar to reach the level. Written out
    rather than expressed as `max`/`min` over an enumeration because the direction of the
    comparison is a parameter here, and a pair of `key=` calls guarded by an `if` says the same
    thing twice.
    """
    best_at = 0
    best = value(bars[0])

    for at in range(1, len(bars)):
        candidate = value(bars[at])
        if candidate > best if higher else candidate < best:
            best_at, best = at, candidate

    return best_at, best


def extreme_points(bars: Sequence[Candle], direction: Direction) -> list[LegPoint]:
    """A leg's three defining points, in the order `reach`, `close`, `hold`.

    Takes the leg's **own** bars, not the global history and an index — deliberately unlike
    `marked_bars` in `leg_reversals.py`, and the difference is not an inconsistency. Those
    filters read outside whatever window they are handed: `expands` averages the ten Candles
    *before* a pair, so a slice cannot answer it. An extreme over a set of bars is fully
    determined by that set. Taking the global array here would advertise a dependency that does
    not exist, and `at` would then need translating back for no gain.

    `at` is therefore already leg-relative, indexing the `LegWindow` these bars came from.

    Empty for empty `bars` — unreachable from a real `LegWindow`, which always holds at least its
    opening vertex, and guarded so the function is total.
    """
    if not bars:
        return []

    higher = direction == "bullish"

    found = []
    for type, value in _READINGS[direction]:
        at, price = _best(bars, value, higher)
        found.append(LegPoint.anchored(bars[at], at=at, type=type, price=price))

    return found


class LegExtremesPattern(Pattern):
    """`extreme_points`, run over the bars of every leg.

    The sources are **instances** rather than producer keys, for the reason `LegPattern` gives:
    passing the key as a string restates what `Pattern.producer` derives, and the two fall out of
    step as a `KeyError` at run time instead of an error at import.

    - `source` — the Pattern whose legs are read. Its Points must carry `bars`.
    - `pivots` — optional, and it is the whole of what varies here: **where a leg's direction comes
      from**.

      Given, `source` is a `LegWindowPattern`: a `LegWindow` anchors on its opening vertex and does
      not say which extreme its close is, so the direction is looked up on the vertex at
      `bars[end]`. Nothing checks that `pivots` *is* the same detector `source` was built on;
      pointing it at another one raises on the first leg, which the route reports under `failed`.

      Omitted, the Points say it themselves — `AdvancingLeg` carries its own `direction`, read
      upstream off the mark the leg opens on. There is no lookup, so there is nothing to disagree
      about and no `ValueError` on this path.

    No dials. There is nothing to tune: an extreme is an extreme, and the one choice this Pattern
    makes — how far past the close to look — is `ahead`, which belongs to `source` and is set
    once, at the pipeline site, for every reader of those legs.

    `name` is per-instance rather than a class attribute, the `LegPattern` and `LegWindowPattern`
    precedent: one class instantiated twice would otherwise put one label on two rows of a sidebar.
    The producer keys already differ by themselves, since `source` renders into them whole.

    Declare it after its sources. There is no dependency graph, and the wrong order leaves the key
    absent from `ctx` with the reason only in the log.
    """

    def __init__(
        self,
        *,
        source: Pattern,
        pivots: Pattern | None = None,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.pivots = pivots
        self.name = f"Leg extremes · {source.name}"

    def run(self, ctx: Ctx) -> BaseSeries[LegExtremes]:
        """One Point per *closed* leg, anchored where the leg is, holding its three defining bars.

        Anchors are the legs' own, untouched, so they are ordered exactly as `source` left them and
        `BaseSeries` has nothing to object to — a prefix of them, since the last leg is dropped.

        The Candles of `emits` are never read: a leg carries its own bars, and every measurement
        here is inside them. That is why this `run` has no `bar_positions` call — there is no
        index to translate.
        """
        legs: BaseSeries[Any] = ctx[self.source.producer]

        # Built only on the path that needs it. Absent `pivots`, a leg names its own direction and
        # there is no second Series in play at all.
        turns: dict[datetime, str] = {}
        if self.pivots is not None:
            pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]
            turns = {pivot.time: pivot.direction for pivot in pivots.points}

        points = []
        # `[:-1]` drops the leg that is still running. No guard: an empty or single-leg list
        # slices to nothing, which is the right answer for both — one leg means that leg is the
        # last one. It also means a `source`/`pivots` mismatch confined to the final leg no
        # longer raises below, because that leg is never asked about; every other one still does.
        #
        # Unconditional, on both kinds of source, and on a flat one that costs something worth
        # stating: `advancing-legs` runs its groups end to end, so the leg sorting last is the one
        # still forming only when `trim_tail` and the advance filter both spared it. Otherwise a
        # closed leg goes unmeasured. Kept anyway — the alternative is measuring a leg whose bars
        # `SimpleLegPattern` redraws on every close, and reporting three levels that move.
        for leg in legs.points[:-1]:
            direction = self._direction(leg, turns)

            points.append(
                LegExtremes.anchored(
                    leg,
                    found=tuple(extreme_points(leg.bars, direction)),
                    direction=direction,
                )
            )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)

    def _direction(self, leg: Any, turns: Mapping[datetime, str]) -> Direction:
        """Which way one leg ran — from the Point itself, or from the vertex it closes on.

        The leg's **own** move either way, and in both readings the only direction in play: nothing
        is filtered for the opposite turn, unlike in `leg_reversals.py`, so there is no second value.
        """
        if self.pivots is None:
            # `AdvancingLeg` and anything else that says so. Read rather than derived, which is the
            # point of carrying the field upstream.
            direction: Direction = leg.direction
            return direction

        close = leg.bars[leg.end]
        side = turns.get(close.time)
        if side is None:
            # The legs were cut at vertices this detector never produced, which means the two
            # sources disagree. Raising beats guessing a direction: a leg measured on the
            # wrong side reports its three points off the real bars, on the wrong end of the
            # move, and looks entirely plausible.
            raise ValueError(
                f"{self.pivots.producer} has no vertex at {close.time.isoformat()}, "
                f"where a leg of {self.source.producer} closes"
            )

        return "bullish" if side == "high" else "bearish"
