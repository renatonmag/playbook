"""The lines a browser drew, as they arrive on the wire and as the engine wants them.

The counterpart to `rule_query`, and written for the same reason: one place where the shape the
client sends and the shape the engine takes are reconciled, so a mismatch is a diff in this file
rather than a `KeyError` three modules away.

Where a rule is eight numbers on the query string, the lines are a list, and a list does not
belong there — a pinned set is a handful today but nothing about it is bounded, and a URL is. So
they arrive in a **body**, which is why `/patterns` has a `POST` beside its `GET` at all. The two
run the same pipeline over the same window; the only difference is that one of them was handed
something the server could not have known.

`time` is Unix seconds, the units `schemas.pattern._seconds` and `CandleOut.time` already write.
That symmetry is the whole of the conversion's correctness: a bar leaves as
`int(row.time.timestamp())`, and `datetime.fromtimestamp(seconds, UTC)` is the same instant back.
The stored column is `timestamptz`, so both sides are aware and nothing is assumed about a local
zone — the failure `validate_window` refuses on the query string, refused here too.

Two refusals, in the spirit of `rule_query`'s: too many lines, and two lines wearing one id.
Neither is a hypothetical. A `POST` body has no length the router would otherwise notice, and the
ids are the caller's own strings — the engine hands them straight back, so a duplicate would come
back as one line's answers reported twice under a name that cannot tell them apart.

**Three lists, not one.** A level is one price at one bar and a trend line is two prices at two, and
they run through different Patterns to different `ctx` keys — so folding them into one list with a
discriminator would be a shape this file invents and both ends then have to undo. The two refusals
are applied to each separately, and their ids are not compared across: they name lines in different
Series, and a `trend-lines` pin and a wick level are free to collide in a namespace neither shares.
All three default to empty, so "only levels" and "only trend lines" are equally sayable and an
older caller sending just `lines` is still saying something valid.

**The third list is not a line at all**, and it is here for one reason: it is a list. The
`ProximityRule` — the ladder saying how near a bar has to get before a near miss is reported — is a
rule like the Forma one and belongs with it on the query string by every argument `rule_query`
makes. What it is not is *eight numbers*: it is a sequence somebody adds rungs to, unbounded in
exactly the way this module's opening paragraph says a URL cannot carry. So it travels in the body,
under this file's own two refusals, and the thing that keeps it honest is stated where the rule is
argued for rather than here: `routers/patterns.py`.
"""

from datetime import UTC, datetime

from fastapi import HTTPException
from pattern_engine.patterns import (
    NO_PROXIMITY,
    Line,
    PinnedLines,
    PinnedTrend,
    PinnedTrends,
    ProximityLevel,
    ProximityRule,
)
from pydantic import BaseModel, Field

#: How many lines one run may be asked about. A ceiling on the request, not a page size: a person
#: pins lines by hand and a set this large is a client bug, not a big question. Raise it when a
#: real screen wants more, rather than guessing upward now.
MAX_LINES = 50

#: How many rungs one proximity ladder may have. A person types these by hand, one per size of move
#: they care about, and a list this long is a client bug rather than a fine-grained opinion. The
#: same kind of ceiling `MAX_LINES` is, and raised the same way — when a real screen wants more.
MAX_PROXIMITY_LEVELS = 10

#: What an overridden proximity rule is always called, borrowed from the declared one for the
#: reason `rule_query.OVERRIDE_NAME` borrows `RULE_K.name`: `ProximityRule.__str__` is what
#: `Pattern.producer` renders, so deriving the name is what makes a run with a ladder and a run
#: without one answer under the same `ctx` key *by construction*.
PROXIMITY_NAME = NO_PROXIMITY.name


class LineIn(BaseModel):
    """One line as the browser names it: its own segment id, the bar it starts on, its price.

    `id` is opaque and stays that way, here and in the engine — it is a `wick:...` string or a
    leg extreme's, minted by `wickLevelId` and `extremeSegmentId`, and its only job is to carry an
    answer back to the pin that provoked it. Nothing on this side parses it, so nothing on this
    side breaks when the browser changes how it spells one.
    """

    id: str = Field(min_length=1)
    #: Unix seconds — see the module docstring for why that is the same instant the bar left as.
    time: int
    price: float


class TrendIn(BaseModel):
    """One sloped line as the browser names it: its own segment id, and its two ends.

    `id` is opaque here as `LineIn.id` is — `trendSegmentId`'s `from:to:side`, or the key of a line
    somebody dragged an end of. Nothing on this side parses it.

    `from` and `to` in the caller's own order, which is the browser's drawing order and not
    necessarily the clock's. Sorting them is `trend_relations`' business and is done once, there.
    """

    id: str = Field(min_length=1)
    #: Unix seconds, both of them — see the module docstring.
    from_time: int
    from_price: float
    to_time: int
    to_price: float


class LevelIn(BaseModel):
    """One rung of the proximity ladder: the legs it claims, and what near means for them.

    `trigger` is a **fraction**, `0.05` for five percent — the units `FormaRule`'s thresholds are
    already in, and the units the engine reads. The screen shows a percentage and converts in the
    one place it renders one, so nothing between here and `proximity.py` has two readings of the
    same number.
    """

    points: float
    trigger: float


class LinesIn(BaseModel):
    """A run's lines and the ladder they are judged by. See the module docstring on why three lists."""

    lines: list[LineIn] = []
    trends: list[TrendIn] = []
    proximity: list[LevelIn] = []


def to_lines(body: LinesIn) -> PinnedLines:
    """The body as the engine's own type, or a 400 saying which rule it broke.

    Order is the caller's, preserved: it is what the Points come back in for one bar, and a set or
    a sort here would silently reorder an answer the caller reads beside its own list.
    """
    if len(body.lines) > MAX_LINES:
        raise HTTPException(
            400, f"at most {MAX_LINES} lines per run — {len(body.lines)} were sent"
        )

    seen: set[str] = set()
    for line in body.lines:
        if line.id in seen:
            raise HTTPException(400, f"two lines share the id `{line.id}`")
        seen.add(line.id)

    return PinnedLines(
        tuple(
            Line(id=line.id, time=datetime.fromtimestamp(line.time, UTC), price=line.price)
            for line in body.lines
        )
    )


def to_trends(body: LinesIn) -> PinnedTrends:
    """The body's sloped lines as the engine's own type, or a 400 saying which rule it broke.

    `to_lines`' twin, refusal for refusal and for the same reasons — the same ceiling, counted over
    this list alone, and the same duplicate-id check over these ids alone.
    """
    if len(body.trends) > MAX_LINES:
        raise HTTPException(
            400, f"at most {MAX_LINES} trend lines per run — {len(body.trends)} were sent"
        )

    seen: set[str] = set()
    for trend in body.trends:
        if trend.id in seen:
            raise HTTPException(400, f"two trend lines share the id `{trend.id}`")
        seen.add(trend.id)

    return PinnedTrends(
        tuple(
            PinnedTrend(
                id=trend.id,
                from_time=datetime.fromtimestamp(trend.from_time, UTC),
                from_price=trend.from_price,
                to_time=datetime.fromtimestamp(trend.to_time, UTC),
                to_price=trend.to_price,
            )
            for trend in body.trends
        )
    )


def to_proximity(body: LinesIn) -> ProximityRule:
    """The body's ladder as the engine's own type, or a 400 saying which rule it broke.

    `to_lines`' third sibling, refusal for refusal: a ceiling, and no two rungs wearing one
    `points` — a duplicate there is not a stricter rule but a row somebody edited twice, and
    silently keeping one of them would answer under a ladder nobody typed.

    Two refusals of its own, both of them about a number that reads plausibly and means nothing:

    - `points` at or below zero is not a leg, and every leg would match the rung. There is no
      meaningful "every leg" setting to spell that way; a rung claiming everything is `points=0`
      meant as `points` unset.
    - `trigger` outside `(0, 1]` is the `wf=49` mistake `rule_query` is written against, wearing
      different clothes: a `5` meant as five percent asks for a reach five times the leg, which
      names every bar on the chart a near miss. Nothing downstream raises on it — `reach` would
      answer a very large number and `nears` would agree — so this is the only layer that can
      tell a typo from an opinion.

    Sorted ascending on the way in, once, so `reach` can walk the rungs in order without sorting
    them on every bar of every line. That is the whole of what the engine trusts, and it is
    established here.

    An empty list is `NO_PROXIMITY` and not an error: no ladder is the setting a caller who is not
    asking about near misses is making, and it is what every caller made before the list existed.
    """
    if len(body.proximity) > MAX_PROXIMITY_LEVELS:
        raise HTTPException(
            400,
            f"at most {MAX_PROXIMITY_LEVELS} proximity levels — {len(body.proximity)} were sent",
        )

    seen: set[float] = set()
    for level in body.proximity:
        if level.points <= 0:
            raise HTTPException(400, "a proximity level's `points` must be above zero")
        if not 0 < level.trigger <= 1:
            raise HTTPException(
                400,
                f"`trigger` is a fraction of the leg, between 0 and 1 — `{level.trigger:g}` "
                "looks like a percentage",
            )
        if level.points in seen:
            raise HTTPException(
                400, f"two proximity levels share the size `{level.points:g}`"
            )
        seen.add(level.points)

    if not body.proximity:
        return NO_PROXIMITY

    return ProximityRule(
        name=PROXIMITY_NAME,
        levels=tuple(
            ProximityLevel(points=level.points, trigger=level.trigger)
            for level in sorted(body.proximity, key=lambda level: level.points)
        ),
    )
