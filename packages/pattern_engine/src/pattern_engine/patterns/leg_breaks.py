"""What a zigzag leg did to the swings before it, how busy it was, and how much it gave back.

Three facts about one leg, and none of them new geometry: every price read here is already on the
wire in a Series of its own. What is new is that they are read *together*, on one Point, anchored
where the leg closed.

The headline is the first. Nothing in this pipeline has answered **"did this leg take out the
swing highs before it, and how many?"** — the question a reader asks the moment a leg closes, and
the one they have been answering by eye off the chart. `retracement.py` comes nearest and
deliberately refuses it: it never reports an extension, so by the time a leg has broken the top
before it that reading has already jumped to an older, larger swing and the break itself is
exactly what it hides. This is the other half of that number.

The two that qualify it ride along because they are unreadable apart from it. A leg that broke two
tops with three simple legs inside it and gave back 40% of the prior move is a different animal
from one that broke two tops with fifteen legs and gave back 95%, and until now those three
numbers sat in three Series nobody held side by side.

**Every price here comes from `leg-reach`, not from the detector.** A zigzag vertex is not its
leg's extreme — `leg_reach.py` opens with the argument and this module is one of the readers it
was written for. Compared against raw vertices, a leg that ran past where it was marked looks like
it broke less than it did, which on a break count is not a rounding error but a missing event.

The rule, for the leg closing at `reaches[i + 1]` and opening at `reaches[i]`; the low side is the
vertical mirror throughout. Three tests, and a level has to pass all three:

- **The side is the close's.** A leg closing on a *high* is measured against earlier *highs*. The
  reaches alternate, so the earlier same-side reaches **are** the prior swing highs — there is no
  other set to search and no window of bars to scan for one.
- **The leg has to have crossed it.** The level lies strictly between the leg's **own two ends** —
  above where the leg opened and below where it closed. Both bounds strict, and symmetrically so:
  a level exactly at the close was **retested**, not broken, and a level exactly at the open is
  where the leg *began* rather than something it ran through. The upper bound is the one that
  reads as "the break"; the lower one is what stops a leg that started a hundred points above an
  old top from claiming it.

  On the upper bound the strictness is deliberately unlike `retracement._origin`'s `>=`: there the
  question is "has price exceeded this", and an exact retest must count as un-exceeded or the
  reading skips a top. Here it is "did this leg break it". The two rules disagree because they are
  asking opposite things about one comparison.
- **The level has to still be standing.** No same-side reach between that level and this leg has
  already gone beyond it. A level taken out three legs ago is gone, and the line from it to this
  leg runs through whatever took it out — so it is not this leg's break to claim. The standing
  levels are a staircase, and `taken_levels` builds it in the one walk that reads it.

The two price tests are independent and both are load-bearing. A level can be standing and sit
entirely outside this leg's span, and it can be crossed and have been broken long ago. Neither
implies the other, and dropping either one is what makes a count that climbs into the dozens.

**The count is what was asked for.** `0` broke nothing, `1` took out the swing before it, and `2`
or more is the case worth a second look — one leg running through several live levels at once.

What it deliberately does not do, and what that costs:

- **Standing is read off the reaches, not off every bar.** A reach is its leg's extreme on the side
  that leg closed, so on that side this is exact. The *other* side of a leg is never recorded —
  a bar midway through a fall that spiked back above an old top leaves no reach behind it — so a
  level called standing here can have been pierced by a wick no pivot saw. The same blind spot
  `leg_reach.py` owns in its "No tail" note, and closing it would mean reading `ctx["bars"]`,
  which this Pattern does not do.
- **The lookback is the loaded window and nothing else.** No `lookback` dial, the bound
  `retracement.py` keeps and the same cost stated the same way: a level whose own bar fell off the
  back of the window is not there to be broken. The stricter rules above blunt this a great deal —
  what a leg can break is the staircase standing in front of it, and that is short — but they do
  not remove it.
- **It counts levels, not distance.** Two standing tops within a tick of each other count as two,
  the same as two spread across the range. `taken` carries the pivots so a reader can see which
  they were; the count alone cannot say.
- **It says nothing about what happened next.** A leg that broke two tops and was rejected reads
  identically to one that broke two and kept going. The leg after it is the one that answers that,
  and it is the next Point of this Series.
- **`ratio` is lifted out of the retracement rather than the measurement carried whole.** The
  origin and the turn are `retracement`'s own Series, and restating them here would be two Series
  claiming one fact — the refusal `LegExtremes` makes about `since`/`end`. `None` keeps that
  module's contract exactly: three causes, one absence, not worth telling apart on the wire.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Pivot
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_reach import LegReach
from .nested_legs import NestedLegs
from .retracement import Retracement
from .simple_leg import integer

#: How a scaled price on each side compares with an earlier one of its own kind.
#:
#: A table rather than branches in the walk below, the form `advancing_legs._READINGS` uses and for
#: its reason: the low side is visibly the vertical mirror of the high one and cannot drift from
#: it. Strict on both sides — see the module docstring on why this is not `retracement`'s `>=`.
_BEATS: dict[Literal["high", "low"], Callable[[int, int], bool]] = {
    "high": lambda level, previous: level > previous,
    "low": lambda level, previous: level < previous,
}


@dataclass(frozen=True, slots=True)
class LegBreak(Pivot):
    """One zigzag leg, read at its close: what it broke, how busy it was, what it gave back.

    Anchored on the bar the leg **reached** its closing extreme on, carrying that extreme as
    `price` — the `Retracement` anchor and its argument: this reports a level reached, and the bar
    it was reached on is the one to put a number beside. Deliberately *not* `NestedLegs`' opening
    vertex, even though `legs` is counted off that group: the group is what closed here.

    So a join against `retracement(source=<leg-reach…>)` is by `time`, and a join against
    `nested-legs` or `leg-window` is not — those anchor where the leg opened. `run` below leans on
    that first one as its alignment check.
    """

    #: Which extreme the leg closed on, in `Pivot`'s vocabulary — the side the breaks are counted
    #: on. `"high"` is a leg that rose into a top, and what it can break are earlier tops.
    direction: Literal["high", "low"]
    #: How many standing same-side levels this leg ran through. `len(taken)`, carried so a row can
    #: be read and filtered without resolving the list. `0` is ordinary — most legs break nothing.
    broke: int
    #: The levels it broke, oldest first: the ones that were still standing when the leg ran and
    #: that sit strictly inside its span. Normalised to bare `Pivot`s — the `RetracedMove.origin`
    #: precedent: one wire shape, and `provisional` or `direction` restated about a *level* would
    #: be facts about the source's Series rather than about this reading.
    taken: tuple[Pivot, ...]
    #: How many simple legs ran inside this zigzag leg — `len(NestedLegs.inside)` and nothing more.
    #: The grouping's own cost notes apply unchanged: an empty group is a fact, not a gap, and it
    #: is how far apart the two detectors are on this stretch.
    legs: int
    #: The fraction of the prior move this leg gave back, or `None` where it could not be measured.
    #: Read off `retracement`, which is the one copy of that arithmetic.
    ratio: float | None
    #: True for the **last** Point only. Its leg closes on the newest vertex, which the zigzag's
    #: cleanup can still relocate — so its close, its breaks and its group can all still move.
    #: Positional, the rule `leg-reach` and `retracement` both use, and conservative for the same
    #: reason they say it is.
    provisional: bool


def taken_levels(reaches: Sequence[LegReach], at: int) -> list[LegReach]:
    """The standing same-side levels the leg closing at `reaches[at]` ran through, oldest first.

    Takes the Points and an index rather than a Series, like every rule in this package, and reads
    only `direction` and `price` off them. Empty for `at == 0`, which closes no leg and has nothing
    behind it.

    **One backward walk, and the walk is the rule.** Going back from `at - 1`, the running
    same-side extreme of everything already passed is exactly "what has happened since this
    candidate" — so a candidate is standing when that running extreme has not beaten it, and
    updating the extreme afterwards carries the answer to the next one. A nested scan would ask
    the same question once per pair; this asks it once per level, and the staircase of live levels
    falls out of the same pass. The result is reversed at the end because the walk produces it
    newest-first and a row reads oldest-first.

    The cross test sits inside that walk rather than after it, and the two are independent: a
    level can be standing and untouched by this leg, or crossed and long since broken. Both have
    to hold, and neither implies the other.
    """
    if at == 0:
        return []

    side = reaches[at].direction
    beats = _BEATS[side]
    level = integer(reaches[at].price)
    opened = integer(reaches[at - 1].price)

    taken: list[LegReach] = []
    running: int | None = None

    for candidate in reversed(reaches[:at]):
        if candidate.direction != side:
            continue

        price = integer(candidate.price)

        # Standing: nothing between this level and the leg has already taken it out. A broken
        # level is gone, and the line from it to this leg runs through whatever broke it.
        if running is None or not beats(running, price):
            # Crossed: strictly inside the leg's own span, so the leg actually ran through it.
            # The upper bound is the break; the lower one is what stops a level the leg began
            # beyond from counting as something it went through.
            if beats(level, price) and beats(price, opened):
                taken.append(candidate)

            # Standing means the running extreme did not beat this level, so this level is at
            # or beyond it and becomes the extreme itself. No `max` needed: the branch has
            # already established which of the two it is.
            running = price

    taken.reverse()
    return taken


class LegBreaksPattern(Pattern):
    """`taken_levels` as a Pattern, with the group's leg count and its retracement alongside.

    Three sources, each an **instance** rather than a producer key, the reason `NestedLegsPattern`
    gives: a key written as a string restates what `Pattern.producer` derives, and the two fall out
    of step as a `KeyError` at run time instead of an error at import.

    - `source` — the `NestedLegsPattern`, for `legs` and for one Point per zigzag leg.
    - `reaches` — the `LegReachPattern` over the **same zigzag**, which is where every price here
      comes from. See the module docstring for why not the detector.
    - `measures` — the `RetracementPattern` over **that** reach, for `ratio`.

    No dials. Every comparison is settled in the module, the lookback is the window, and the
    detector's own tuning belongs at the pipeline site.

    Declare it after all three. There is no dependency graph, and the wrong order leaves the key
    absent from `ctx` with the reason only in the log.
    """

    name = "Leg breaks"

    def __init__(
        self,
        *,
        source: Pattern,
        reaches: Pattern,
        measures: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.reaches = reaches
        self.measures = measures

    def run(self, ctx: Ctx) -> BaseSeries[LegBreak]:
        """One Point per zigzag leg, anchored on the reach that closed it.

        **The three Series are joined by position, and that is the load-bearing decision here.**
        A join by `time` is not available: a `LegReach` anchors on the bar its leg reached, which
        is not the vertex `NestedLegs` anchors on, so the two Series' anchors do not line up even
        though their entries do. What lines them up is a chain of promises each source makes about
        its own length and order — `split_leg_windows` emits one window per consecutive pivot pair
        in pivot order, `nested_legs` one Point per window, `leg_reaches` "one Point per source
        pivot, in the source's order", and `retracements` one entry per consecutive pair. So:

        ```
        source[i]     the leg between pivots i and i+1
        reaches[i+1]  that leg's closing extreme; reaches[:i+1] is every earlier one
        measures[i]   that leg's retracement
        ```

        Promises, not checks — so this checks them, the `advancing_legs` precedent. The lengths
        catch a pipeline that pointed `reaches` at the other detector, and the per-entry anchor
        comparison catches the subtler one: `Retracement` anchors on the reach pivot it closes on,
        so `measures[i].time == reaches[i + 1].time` is the real proof the two chains are the same
        chain, and it costs one comparison per leg. Both raise rather than emit a Series that is
        quietly about two different runs.

        `ctx["bars"]` is never read: every price in play arrives inside one of the three Series.
        An empty `source` — fewer than two vertices — yields an empty Series with no guard, since
        neither loop runs.
        """
        groups: BaseSeries[NestedLegs] = ctx[self.source.producer]
        reaches: BaseSeries[LegReach] = ctx[self.reaches.producer]
        measures: BaseSeries[Retracement] = ctx[self.measures.producer]

        # No legs, so nothing to align and nothing to walk. Ahead of the check rather than left
        # to fall out of it, because the length rule below is a statement about a run that found
        # *some* vertices: a run over no bars at all has no reaches either, and `0 != 0 + 1` would
        # turn the quietest case there is into a failure.
        if not groups:
            return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), [])

        if len(reaches) != len(groups) + 1 or len(measures) != len(groups):
            raise ValueError(
                f"{self.producer} was handed Series of unalignable lengths: "
                f"{len(groups)} groups, {len(reaches)} reaches, {len(measures)} measurements"
            )

        last = len(groups) - 1
        points = []

        for index, group in enumerate(groups.points):
            close = reaches[index + 1]
            measured = measures[index]

            if measured.time != close.time:
                raise ValueError(
                    f"{self.measures.producer} does not measure the legs of "
                    f"{self.reaches.producer}: leg {index} closes at {close.time} "
                    f"and is measured at {measured.time}"
                )

            taken = taken_levels(reaches.points, index + 1)

            points.append(
                LegBreak.anchored(
                    close,
                    price=close.price,
                    direction=close.direction,
                    broke=len(taken),
                    # Bare `Pivot`s: one shape whatever the source was — see the field's own note.
                    taken=tuple(Pivot.anchored(level, price=level.price) for level in taken),
                    legs=len(group.inside),
                    ratio=measured.measured.ratio if measured.measured else None,
                    provisional=index == last,
                )
            )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
