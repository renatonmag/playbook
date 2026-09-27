"""`line_respect`'s stretches, read off an average's relations — one class, for one reason: the name.

`LineRespectPattern` already does all of this. Its own docstring says why it can: "a respect group is
a run of events with no definitive breakout in it, and that reads `kind`, `side` and `since` off a
`LineRelation` without ever asking what drew the line." An average's relations are `LineRelation`s,
so that Pattern would run over them unchanged and answer correctly. **Nothing here changes any
behaviour, and nothing is overridden.**

What the subclass buys is a `producer` whose class part is `average-respect` rather than
`line-respect`, and that is not tidiness — it is the difference between this Series appearing on
screen and not. Three sets in the web app are keyed by the class part of a producer:
`OVERLAYS` and `LOGGED` in `apps/web/app/components/PatternLog.vue`'s and `pages/monitor.vue`'s
sense, and `MANUAL` in `apps/web/app/utils/manual-series.ts`. `line-respect` is in `MANUAL`, which
means its Series is taken off the `POST` and the automatic `GET`'s copy is dropped — and the
monitor's `calculate()` does not even send a `POST` unless a line is pinned. An average's respect
groups wearing that name would therefore be invisible unless somebody happened to have pinned a
level, which has nothing to do with them.

`MANUAL`'s own docblock is what makes this the right cut rather than a workaround. It explains that
the two existing `line-respect` Series share one name because both are downstream of the pinned
lines, so one rule about where the answer comes from is true of both. That reason does not reach
this one: it is downstream of an average the pipeline computes on every run, so the `GET` fills it
and the set must not claim otherwise. A name of its own is how it says so.

The cost is the one every empty subclass has: a reader looking for the behaviour has to follow one
hop to `line_respect`, and a change there changes this too, silently and correctly. Both are
intended — that this *is* `line_respect` is the claim being made.
"""

from .line_respect import LineRespectPattern


class AverageRespectPattern(LineRespectPattern):
    """`LineRespectPattern` under a producer name of its own. See the module docstring.

    Takes the same parameters, reads the same `ctx` keys, emits the same `LineRespect` Points. Its
    `source` is an `AverageRelationsPattern` instance, and nothing enforces that — the parent
    deliberately does not care which relations Series it is given, and this class adds no opinion it
    could not justify.
    """
