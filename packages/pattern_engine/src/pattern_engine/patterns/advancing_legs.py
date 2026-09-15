"""Which simple legs inside a zigzag leg were actually getting somewhere.

`nested-legs` lists every simple leg that started inside a zigzag leg — the pushes and the
pullbacks alike, in the order they ran. That is the honest grouping, and it is also more than a
reader wants: inside a bullish leg, the pushes that failed to clear the previous one say nothing
about the move, and separating them from the ones that did is done by eye today.

This is that separation. Inside a **bullish** zigzag leg a simple leg survives when it is either:

- a **pullback** — a bearish simple leg. Always kept. A pullback is not a failed advance; it is
  the other half of what a leg is made of, and dropping it would leave a Series that cannot say
  where an advance started from.
- an **advance** — a bullish simple leg that made a **new high**.

A bullish simple leg that made no new high is the only thing dropped. A bearish zigzag leg is the
vertical mirror throughout: its pullbacks are the bullish legs, and its advances are the bearish
legs that made a new low.

**A new high is read off the leg's last bar**, not off its highest one:

```
bullish group:  leg.bars[-1].high  >  the running high
bearish group:  leg.bars[-1].low   <  the running low
```

So a leg that spiked above the running high somewhere in its middle and gave it all back before
its final bar did **not** make a new high. That is deliberate: the question is where the leg *got
to*, and an intraleg spike it could not hold is not where it got to. `leg-extremes` is the Pattern
that answers the other question, about the highest bar.

**The group's tail is trimmed first.** A group's last leg often *ends* on the zigzag leg's closing
vertex — or one bar past it — and then it only restates where the zigzag has already said the move
ended. That leg goes, whatever the group's size, and a group holding nothing else is left empty.

The trim runs **before** the filter below, on the group as `nested-legs` delivered it, so the leg
it takes is never judged at all.

Nothing here is about a leg that *starts* on the closing vertex. Such a leg belongs to the group
that vertex opens, and `nested_legs` puts it there: its interval is `[opening, closing)`. This
Pattern used to compensate for the opposite boundary by deleting that leg, which was papering over
a misgrouping rather than expressing a rule.

Three more rules, each settled and none of them a dial:

- **The comparison is strict.** A leg that exactly equals the running high is dropped — equalling
  a level is not clearing it.
- **The running extreme starts unbounded**, at `-inf` on a bullish group and `+inf` on a bearish
  one. So the first advance in a group is always kept, whatever it did. There is no prior push in
  the group to compare it against, and the zigzag leg's opening vertex is the wrong barrier — on a
  bullish leg that vertex is a *low*.
- **Only kept legs move the running extreme.** A dropped leg is dropped precisely because it did
  not clear it, so there is nothing for it to move.

The output is one **flat** Series of survivors across every group, not a Series of groups.

What it costs, stated rather than hidden:

- **Two directions on one Point**, `direction` and `group`. `direction` is the leg's **own** move
  and `group` is that of the zigzag leg it survived inside, and in a flat list the comparison
  between them is the only thing separating an advance (`direction == group`) from a kept pullback
  (`direction != group`). Neither field alone can say it. The comparison itself is not stored: it
  is derivation, and a Point carries attributes.
- **The last zigzag leg is kept**, unlike `leg-extremes`, which skips it. Its closing vertex is
  provisional and moves as price makes a further extreme — taking that group's `group` direction,
  and therefore this whole filter over it, with it.
- **The last simple leg of the window may open on a provisional mark.** `SimpleLegPattern` gives
  the leg still running an endpoint on the newest bar, so that leg's `direction` is the side the
  running leg *would* end on, and it is redrawn by every bar that closes.
- **Simple legs outside every zigzag leg were already dropped upstream**, by `nested-legs`. Read
  this Series as "per zigzag leg", never as "every simple leg".
- **The trim can empty a group**, since it has no size floor: a group whose one leg ends on the
  close, or a bar past it, comes back with nothing. So a zigzag leg contributing nothing to this
  Series is now two facts — the simple detector marked no turn inside it, or its only leg was pure
  restatement — and the output, being flat, distinguishes neither. `nested-legs` is where that
  question is answered.
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .leg_processor import Leg
from .nested_legs import NestedLegs
from .simple_leg import LegMark
from .zigzag import ZigZagPivot


@dataclass(frozen=True, slots=True)
class AdvancingLeg(Candle):
    """One simple leg that survived the filter, anchored on its first bar, like `Leg` is.

    The bars are `Leg`'s own, carried through untouched: this Pattern measures nothing and
    invents no geometry, it only drops legs.
    """

    #: An array on the wire: the Python tuple serializes as a list.
    bars: tuple[Candle, ...]
    #: The leg's **own** move, read off the `simple-leg` mark it opens on.
    direction: Direction
    #: The move of the zigzag leg it survived inside, read off that leg's closing vertex. Compare
    #: the two to read the leg's role: equal is an advance, different is a kept pullback.
    group: Direction


#: How each direction reads a leg's last bar, and how it compares two such readings.
#:
#: A table rather than a branch inside the loop, so the bear side is visibly the vertical mirror
#: of the bull one and cannot drift from it — the form `leg_extremes._READINGS` uses. Both
#: comparisons are strict; see the module docstring.
_READINGS: dict[Direction, tuple[Callable[[Candle], float], Callable[[float, float], bool]]] = {
    "bullish": (lambda bar: bar.high, lambda value, running: value > running),
    "bearish": (lambda bar: bar.low, lambda value, running: value < running),
}

#: What the running extreme starts at, per direction. Unbounded on both sides, so a group's first
#: advance clears it by construction.
_SEED: dict[Direction, float] = {"bullish": float("-inf"), "bearish": float("inf")}


def trim_tail(
    inside: Sequence[Leg], closes: datetime, after: datetime | None
) -> Sequence[Leg]:
    """One group's legs without its last, when that last leg ends where the zigzag leg ends.

    One comparison, on the leg's **final bar** rather than on its anchor: a leg closing on the
    vertex says only what `leg-window` already says with `end`, so it is restatement, not a
    finding.

    **One bar of tolerance.** `after` is the bar following the closing vertex, and a last leg
    ending there is dropped too — a leg that overshoots the vertex by a single bar and stops is
    making the same restatement, a bar late. One bar and not a range, because that is where the
    real distribution falls off a cliff: on ten days of 5m bars, of 62 filled groups the last leg
    ends on the close in 33 and one bar past it in 24, and only 5 end further out. Two bars past
    is a leg that went somewhere.

    **No size floor**: a one-leg group whose leg ends there is emptied, not spared. What such a
    group held was a leg saying only what `end` already said, and keeping it to avoid an empty
    group would be keeping a Point for the shape of the output rather than for what it says.

    `after` may be `None`, for a window that ends on its own close. Left to the membership test
    rather than branched on: a `Leg` always has a `time`, so `None` matches nothing, which is the
    whole of what the absent bar should do.

    Takes the two bars' `time`s rather than the `LegWindow` they sit in, like every other rule in
    this package takes Points: the trim knows nothing about Series, or about `since`/`end`.
    """
    if inside and inside[-1].bars[-1].time in (closes, after):
        return inside[:-1]
    return inside


def advancing_legs(
    inside: Sequence[Leg], sides: Mapping[datetime, Direction], group: Direction
) -> list[Leg]:
    """The legs of one group that survive: every pullback, and every advance that made a new extreme.

    `sides` maps a leg's anchor `time` to that leg's own direction. A mapping rather than a field
    on `Leg`, because a `Leg` carries only its bars — see `AdvancingLegsPattern` for where it comes
    from. A leg missing from it raises `KeyError`; the adapter is what turns that into a message.

    Takes the Points rather than the Series, like every other rule in this package: the filter
    knows nothing about identity, and the adapter below is where a Series is made.

    Empty for empty `inside`, and for a group whose every advance failed.
    """
    reading, beats = _READINGS[group]
    running = _SEED[group]

    kept: list[Leg] = []
    for leg in inside:
        if sides[leg.time] != group:
            # A pullback. Kept whatever it did — it is not competing with the advances, and the
            # running extreme is not its to move.
            kept.append(leg)
            continue

        value = reading(leg.bars[-1])
        if beats(value, running):
            kept.append(leg)
            running = value

    return kept


class AdvancingLegsPattern(Pattern):
    """`advancing_legs` as a Pattern: `nested-legs` with the legs that got nowhere taken out.

    Three sources, and each is an **instance** rather than a producer key, for the reason
    `LegPattern` gives: passing the key as a string restates what `Pattern.producer` derives, and
    the two fall out of step as a `KeyError` at run time instead of an error at import.

    - `source` — the `NestedLegsPattern` whose groups are filtered.
    - `pivots` — the `ZigZagPattern` those groups were cut at, for each **group's** direction. A
      `LegWindow` anchors on its opening vertex and does not say which extreme its close is, which
      is exactly the thing the filter mirrors on. The same second source, for the same reason,
      that `LegReversalsPattern` and `LegExtremesPattern` take.
    - `marks` — the `SimpleLegPattern`, for each **leg's own** direction. A third source because
      the two directions come from two different detectors, and a `Leg` records neither.

    A leg's own direction is read off the mark it **opens** on, not the one it closes on:
    leaving a `low` is going up. That choice is what makes the lookup total. `split_legs` folds
    the window's tail into its final leg, so that leg's last bar can sit past the last mark — but
    every leg's *first* bar is a mark, except the head fold, and `nested_legs` has already dropped
    that one, since it keeps only legs starting strictly after a zigzag leg's opening vertex.

    No dials. Both the rule and the seed are settled in the module docstring, and both sources are
    already tuned at the pipeline site.

    Declare it after all three sources. There is no dependency graph, and the wrong order leaves
    the key absent from `ctx` with the reason only in the log.
    """

    name = "Advancing legs"

    def __init__(
        self,
        *,
        source: Pattern,
        pivots: Pattern,
        marks: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.pivots = pivots
        self.marks = marks

    def run(self, ctx: Ctx) -> BaseSeries[AdvancingLeg]:
        """One Point per surviving leg, flat across every group, anchored where the leg starts.

        The Points stay ordered without sorting, and the reason is worth stating: the groups
        partition the line by where a simple leg *starts*, and inside a group the legs start on
        strictly increasing bars — so concatenating the survivors group by group is already
        ordered by anchor and `BaseSeries` has nothing to object to. That the final leg of a group
        can *end* past the group's close does not disturb it; anchors are starts.

        The Candles of `emits` are never read: every bar in play arrives inside a `Leg`, so there
        is no window to translate an index against and no `bar_positions` call here.
        """
        groups: BaseSeries[NestedLegs] = ctx[self.source.producer]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]
        marks: BaseSeries[LegMark] = ctx[self.marks.producer]

        turns = {pivot.time: pivot.direction for pivot in pivots.points}
        # Leaving a `low` is going up, and leaving a `high` is going down — the mark a leg opens
        # on, read as the leg's own move.
        sides: dict[datetime, Direction] = {
            mark.time: ("bullish" if mark.direction == "low" else "bearish")
            for mark in marks.points
        }

        points: list[AdvancingLeg] = []
        for point in groups.points:
            bars, end = point.leg.bars, point.leg.end
            close = bars[end]
            # The bar the trim tolerates a leg running on to. Absent only for a window that ends
            # on its own close, which `ahead > 0` makes impossible in the pipeline today.
            after = bars[end + 1] if end + 1 < len(bars) else None
            side = turns.get(close.time)
            if side is None:
                # The groups were cut at vertices this detector never produced, which means the
                # two sources disagree. Raising beats guessing a direction: a group filtered on
                # the wrong side keeps its pullbacks and drops its advances, and looks entirely
                # plausible.
                raise ValueError(
                    f"{self.pivots.producer} has no vertex at {close.time.isoformat()}, "
                    f"where a leg of {self.source.producer} closes"
                )
            group: Direction = "bullish" if side == "high" else "bearish"

            # Before the guard below and before the filter, so a trimmed leg is never looked
            # up and never judged: this Pattern has no opinion about a leg it discarded.
            inside = trim_tail(point.inside, close.time, after.time if after else None)

            for leg in inside:
                if leg.time not in sides:
                    # Same failure, on the other source: legs cut at marks this detector never
                    # produced. A leg whose direction was guessed is a pullback counted as a
                    # failed advance, or the reverse, and neither shows up as anything but a
                    # slightly different table.
                    raise ValueError(
                        f"{self.marks.producer} has no mark at {leg.time.isoformat()}, "
                        f"where a leg of {self.source.producer} opens"
                    )

            for leg in advancing_legs(inside, sides, group):
                points.append(
                    AdvancingLeg.anchored(
                        leg.bars[0], bars=leg.bars, direction=sides[leg.time], group=group
                    )
                )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
