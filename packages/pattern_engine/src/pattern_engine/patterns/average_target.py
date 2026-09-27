"""`leg_target`'s join, read against an average — one class, for one reason: the name.

`LegTargetPattern` already does all of this, and `average_respect.py` is this file's argument almost
word for word one Series earlier. `leg_targets` asks a leg's extreme bar whether it sits inside a
stretch some line held from the side that would have stopped the leg, and every field it reads to
answer — `bars`, `side`, `line`, `price` — is on a `LineRespect` and says nothing about what drew
the line. An average's respect groups *are* `LineRespect`s. So that Pattern runs over them
unchanged and answers correctly. **Nothing here changes any behaviour, and nothing is overridden.**

What the subclass buys is a `producer` whose class part is `average-target` rather than `leg-target`,
and the reason is the one `average_respect.py` gives: three sets in the web app are keyed by exactly
that string, and `leg-target` is in `MANUAL` — the set of Series that are only ever filled by a
`POST`, taken off that run with the automatic `GET`'s copy dropped. `monitor.vue`'s `calculate()`
does not send a `POST` at all unless a line is pinned. A target against an average wearing that name
would therefore be invisible until somebody happened to pin a level, which has nothing to do with
it.

And `MANUAL` is right about the two Series already there. Both are downstream of the pinned lines, so
one rule about where their answer comes from is true of both. That reason does not reach this one:
its whole chain — the average, its relations, its respect groups — is computed on every run from
closes this server already holds, so the `GET` fills it and the set must not claim otherwise. A name
of its own is how it says so, and it is the same cut, made for the same reason, one step further
down the same chain.

The cost is the one every empty subclass has: a reader looking for the behaviour has to follow one
hop to `leg_target`, and a change there changes this too, silently and correctly. Both are intended —
that this *is* `leg_target` is the claim being made.

One thing that is *not* a cost, stated because it looks like one: the Points are `LegTarget`s, and
their `line` is the average's own name rather than a browser segment id — `wma-30`, `wma-30-1h`.
`LineRelation.line` has carried ids of both kinds since `average_relations` landed and says so in its
own docstring. There is nothing new to explain here, only one more Series it is true of.
"""

from .leg_target import LegTargetPattern


class AverageTargetPattern(LegTargetPattern):
    """`LegTargetPattern` under a producer name of its own. See the module docstring.

    Takes the same parameters, reads the same `ctx` keys, emits the same `LegTarget` Points. Its
    `respects` is an `AverageRespectPattern` instance, and nothing enforces that — the parent
    deliberately does not care which respect Series it is given, and this class adds no opinion it
    could not justify.

    `name` is inherited whole, so it reads `Targets · Respect · Relations · wma-30`: four links,
    each naming what the one before it was asked about. Long, and every link earns its width — the
    alternative is two rows of a picker that differ only in a period nobody can see.
    """
