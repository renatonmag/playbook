"""How near a bar has to get to a line before the near miss is worth reporting.

`line_relations` asks whether a bar *reached* a line, and a touch there is a wick containing the
price with no tolerance at all. That is the right rule for the question it answers and the wrong
one for the question a person watching a level actually asks: a bar that ran to within a handful
of points of the line and turned there said something, and the Series said nothing about it.

The missing piece is not a tolerance, it is a **scale**. Fifty points from the line is a near miss
inside a thousand-point leg and an unrelated bar inside a two-hundred-point one, so a single
number cannot be written down here or anywhere else — it depends on the move in progress. This
module is that dependency made explicit: a rule is a ladder of levels, each one saying *for legs
this big, near means this fraction of the leg*.

```
ProximityLevel(points=1000, trigger=0.05)   legs of 1000 points and up: near is 5% of the leg
```

The rules, and what each one deliberately does not say:

- **A level's `points` selects, it does not measure.** It is the floor of a bucket — the level that
  applies is the **last** one whose `points` is at or below the leg's size — and the reach is then
  `leg_points * trigger`, taken off the leg's *actual* size rather than the bucket's. A 1200-point
  leg under the 1000/5% level reaches 60 points, not 50. The alternative, a flat reach per bucket,
  would make the rule jump at every boundary and would answer differently for two legs a point
  apart.

- **A leg below the smallest level gets no reach, and that is a setting.** `reach` answers `None`,
  the caller emits nothing, and the ladder is how a person says "moves this small are not what I
  am watching". It is not a fallback and there is no implicit bottom level: inventing one would be
  this module deciding the thing the ladder exists to let somebody else decide.

- **`trigger` is a fraction, not a percentage.** `0.05`, the units `FormaRule`'s thresholds are
  already in, so the one place a percentage exists is the screen that shows one. Nothing here
  validates the range — that is `playbook_api.lines_body`'s job, where a `5` meant as five percent
  can still be refused with a sentence. By the time a rule is here it is trusted, the way a
  `FormaRule` is trusted by `marks`.

- **The levels are ascending and this module trusts that.** Sorting is done once, where a rule is
  built from the wire, for the same reason: a sort here would be a second answer to a question
  already settled, run on every bar of every line.

- **The reach is reported on the instrument's tick, not on the float.** `leg_points * trigger` is
  exact and unactionable: a 1230-point leg at five percent reaches 61.5, a distance no price here
  can be that far away, since `WIN@N` moves in fives. The answer is rounded to the nearest `TICK`,
  and 61.5 becomes 60. What it costs is the thing the bucket design refused, reintroduced at a
  smaller scale: two legs a few points apart can now answer the same reach, and the reach jumps at
  every half-tick rather than sliding. Five points is the scale the price itself moves in, so the
  jump is under the resolution of the question.

- **A reach can round to zero, and that reports nothing.** A leg whose trigger comes to under half
  a tick — a 40-point leg at five percent — answers `0.0`, and `line_relations` finds no near miss
  under it, because a line strictly outside a bar is always some distance away and nothing is
  within zero. Not special-cased, and not the same answer as `None`: a rung *did* claim the leg,
  and what it said is that nothing is near enough to mention.

What it costs, stated rather than hidden:

- **The producer key does not name the numbers.** `__str__` answers a constant, so two runs under
  different ladders answer under the same `ctx` key — the trade `FormaRule.__str__` and
  `PinnedLines.__str__` both make, and the same cost: the response does not say which rule ran, and
  a caller that caches has to fold the numbers into its own key.

- **An empty rule is the rule that reports nothing.** `NO_PROXIMITY` is what a pipeline built
  without a browser runs, and it makes the near-miss question cost one `if` per bar rather than
  being a Pattern that is sometimes in the tuple.
"""

import math
from dataclasses import dataclass

#: The grid a reach is reported on, in points. A claim about this installation rather than about
#: arithmetic: the only Instrument here is `WIN@N`, quoted in whole points and moving in fives, so
#: a reach carrying a fraction of a point describes a precision the instrument does not have. An
#: Instrument with a finer tick would want its own, and it would come from the Instrument — the
#: same absence `apps/web/app/utils/ruler.ts` names where it rounds a measured distance.
TICK = 5.0


@dataclass(frozen=True, slots=True)
class ProximityLevel:
    """One rung of the ladder: the legs it claims, and what near means for them."""

    #: The smallest leg, in points, this rung speaks for. A rung claims every leg from here up to
    #: the next rung's `points`, and the last rung claims everything above it.
    points: float
    #: The fraction of a leg's size that counts as near — `0.05` is five percent. See the module
    #: docstring on why the fraction is taken off the leg and not off `points`.
    trigger: float


@dataclass(frozen=True, slots=True)
class ProximityRule:
    """The whole ladder, wrapped so it can be a Pattern parameter.

    Wrapped rather than passed as a bare tuple for the reason `PinnedLines` is: `Pattern.producer`
    renders every parameter, so a tuple would put each rung's numbers into the `ctx` key and move
    every key whenever somebody edited a digit. `__str__` answering a constant is what stops that.

    `levels` is ascending by `points`, and nothing here checks it — see the module docstring.
    """

    name: str
    levels: tuple[ProximityLevel, ...]

    def __str__(self) -> str:
        return self.name

    def __len__(self) -> int:
        return len(self.levels)

    def __bool__(self) -> bool:
        return bool(self.levels)


def reach(rule: ProximityRule, leg_points: float | None) -> float | None:
    """How near counts as near for a leg this size, or `None` when no rung claims it.

    `leg_points` is `None` where the caller has no leg for the bar at all — a window with too few
    vertices to carve one, or a Pattern handed no leg Series. One answer for both, because they are
    one fact: nothing says how big the move is, so nothing says how near is near.

    The answer is on the `TICK` grid — see the module docstring — and so can be `0.0` for a leg
    small enough, which is a rung saying nothing is near enough here rather than no rung at all.

    A walk rather than a search: a hand-typed ladder is a few rungs, and the loop reads as the rule
    reads.
    """
    if leg_points is None:
        return None

    found: ProximityLevel | None = None
    for level in rule.levels:
        if level.points > leg_points:
            break
        found = level

    if found is None:
        return None

    # `floor(x + 0.5)` and not `round(x)`: the builtin rounds a half to the even side, so a reach
    # of 62.5 would answer 60 while 67.5 answered 70. A person reading "nearest multiple of five"
    # means the half goes up, every time.
    return math.floor(leg_points * found.trigger / TICK + 0.5) * TICK


#: The parameter a pipeline built without a browser gets: no rungs, and so no near misses. What
#: `reach` answers under it is `None` for every leg, whatever its size.
NO_PROXIMITY = ProximityRule(name="proximidade", levels=())
