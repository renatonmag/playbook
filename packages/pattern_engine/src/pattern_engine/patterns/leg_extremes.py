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

- **The whole `LegWindow.bars` is scanned, tail included** — the same span `LegReversalsPattern`
  reads, so the two Patterns disagree about no bar. The tail matters here for its own reason: a
  leg that is exceeded a bar or two *after* its vertex is a fact, and hiding it behind the slicing
  would be a claim that it did not happen.
- **Ties keep the earliest bar.** The comparison is strict, so the first bar to reach a level
  keeps it — `max` semantics, and the reading is "when the level was achieved".
- **The direction comes from the leg**, which is why the pivots are a second input: `LegWindow`
  anchors on its opening vertex and does not say which extreme its closing vertex is.
- **No mirror**, unlike `leg_reversals.py`, which filters a leg for the *opposite* direction to
  its own. Here the leg's own direction is both what is measured and what is reported, and there
  is no second value to confuse it with.

What it costs, stated rather than hidden:

- **The reach can sit past the close.** Scanning the tail means a leg whose successor opened
  beyond it reports a `reach` with `at > end`. Read that as "the level was exceeded after the
  turn" — it is information, and it is why `reach` must never be read as "the closing vertex".
  The vertex is `bars[end]`, and `LegWindow` already says so.
- **Consecutive legs overlap** by `ahead + 1` bars, so one bar can be a defining point of two
  legs. A property of `LegWindow`, restated here rather than fixed — the question is what each
  leg reached, and a bar can be in two legs.
- **The three can land on one bar.** A one-bar move, or a bar that both spiked and closed at the
  extreme, yields three points with the same `at` and a different `type` each. Key a point on
  `at` *and* `type`, never on `at` or `time` alone — the same rule `LegBar` carries.
- **The OHLCV inherited from `Candle`** is the leg's anchor bar's, as on `LegWindow`, and says
  nothing about any of the three points. Those are in `found`.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .leg_window import LegWindow
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

    Two sources, and each is an **instance** rather than a producer key, for the reason
    `LegPattern` gives: passing the key as a string restates what `Pattern.producer` derives, and
    the two fall out of step as a `KeyError` at run time instead of an error at import.

    - `source` — the `LegWindowPattern` whose legs are read.
    - `pivots` — the `ZigZagPattern` those legs were cut at, for the direction of each leg's
      close. Nothing checks that it *is* the same detector `source` was built on; pointing it at
      another one raises on the first leg, which the route reports under `failed`.

    No dials. There is nothing to tune: an extreme is an extreme, and the one choice this Pattern
    makes — how far past the close to look — is `ahead`, which belongs to `source` and is set
    once, at the pipeline site, for every reader of those legs.

    Declare it after both sources. There is no dependency graph, and the wrong order leaves the
    key absent from `ctx` with the reason only in the log.
    """

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

    def run(self, ctx: Ctx) -> BaseSeries[LegExtremes]:
        """One Point per leg, anchored where the leg is, holding its three defining bars.

        Anchors are the legs' own, untouched, so they are ordered exactly as `LegWindowPattern`
        left them and `BaseSeries` has nothing to object to.

        The Candles of `emits` are never read: a leg carries its own bars, and every measurement
        here is inside them. That is why this `run` has no `bar_positions` call — there is no
        index to translate.
        """
        windows: BaseSeries[LegWindow] = ctx[self.source.producer]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]

        turns = {pivot.time: pivot.direction for pivot in pivots.points}

        points = []
        for window in windows.points:
            close = window.bars[window.end]
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

            # The leg's own move — and here, unlike in `leg_reversals.py`, the only direction in
            # play. Nothing is filtered for the opposite turn, so there is no second value.
            direction: Direction = "bullish" if side == "high" else "bearish"

            points.append(
                LegExtremes.anchored(
                    window,
                    found=tuple(extreme_points(window.bars, direction)),
                    direction=direction,
                )
            )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
