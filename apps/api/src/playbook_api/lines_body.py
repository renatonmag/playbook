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

**Two lists, not one.** A level is one price at one bar and a trend line is two prices at two, and
they run through different Patterns to different `ctx` keys — so folding them into one list with a
discriminator would be a shape this file invents and both ends then have to undo. The two refusals
are applied to each separately, and their ids are not compared across: they name lines in different
Series, and a `trend-lines` pin and a wick level are free to collide in a namespace neither shares.
Both default to empty, so "only levels" and "only trend lines" are equally sayable and an older
caller sending just `lines` is still saying something valid.
"""

from datetime import UTC, datetime

from fastapi import HTTPException
from pattern_engine.patterns import Line, PinnedLines, PinnedTrend, PinnedTrends
from pydantic import BaseModel, Field

#: How many lines one run may be asked about. A ceiling on the request, not a page size: a person
#: pins lines by hand and a set this large is a client bug, not a big question. Raise it when a
#: real screen wants more, rather than guessing upward now.
MAX_LINES = 50


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


class LinesIn(BaseModel):
    """A run's lines: the levels, and the sloped ones. See the module docstring on why two lists."""

    lines: list[LineIn] = []
    trends: list[TrendIn] = []


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
