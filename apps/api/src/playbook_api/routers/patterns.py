"""`GET /patterns` — one run of the declared pipeline, for the development chart.

**This is not a tick.** It is an inspector: it runs the pipeline once, over a window the caller
names, so the result can be drawn and judged by eye.

The *shape* of the pipeline is still declared in code (`playbook_api.pipeline`) and nothing here
composes one: no caller adds a Pattern, removes one, reorders them, or retunes `depth`, `ahead`,
`k`, `similarity` or `expansion`. What a caller may now do is hand in **the Forma rule that one
Pattern applies** — the eight thresholds of `FormaRule`, and nothing else.

That exception was made with the reason written down rather than assumed. The bench on `/rules`
evaluates a candidate rule in the browser, over Shapes that `/shapes` already handed it, which is
why `/shapes` takes no rule parameters and why `marks` lives in `apps/web/app/utils/rule.ts`. The
monitor cannot do the same. `bars` applies its rule *inside* the engine, against the global bar
history, over quantities that never cross the wire — the average amplitude behind a bar, the bar
before it, the session boundaries the run walks through. Re-deriving that in the client would be
a third implementation of arithmetic that `shape.py` and `rule.ts` already document as a cost
paid reluctantly. So the thresholds travel to the server, and only those.

Three things keep this from becoming "the browser authors the pipeline":

- **The rule's name is never a parameter.** An override is always named `K`, whatever its
  numbers. `FormaRule.__str__` is what `Pattern.producer` renders, so every `ctx` key — and every
  checkbox on the screen that is keyed by one — is identical whether or not an override was sent.
  The cost `FormaRule.__str__` declares is paid here in full: two requests carrying different
  numbers answer under the same key, and the response does not say which numbers ran. That is
  deliberate, and the screen carries the badge that keeps it honest.
- **`direction` is never a parameter**, because `FormaRule` has no such field. Every bar is asked
  for both turns and the mark says which one it is a candidate for — see `BarsPattern`.
- **A rule is all-or-nothing.** Seven of the eight fields arrive together or not at all; `wcr` is
  exempt because "no proportional frontier" is a real setting whose absence says nothing. A
  half-specified rule is a 400, not a rule wearing this server's defaults wherever the caller went
  quiet. `parseRule` in `rule.ts` refuses in the same words. See `playbook_api.rule_query`.

With no rule parameters at all, this route runs the very tuple a tick worker would import — the
same object, not an equal one — and answers exactly what it answered before any of this existed.

**The second exception is the lines somebody drew**, and it is argued the same way rather than
waved through on the first one's precedent. `line-relations` reports what the bars have done
around a level a person pinned on the monitor — a leg extreme, the end of a candle's wick. That
level is a `Set<string>` in the browser and nowhere else: it is not a quantity this server could
compute better or worse, it is a quantity this server does not have. Where the rule's case had to
argue that the client *could* evaluate it and shouldn't, this one has no such argument to lose.

What keeps it contained is the same pair:

- **No line changes the shape of the pipeline.** The Pattern is in the tuple on every run, lines
  or not; with none it emits an empty Series. A caller adds data to a question, never a Pattern.
- **The producer key does not move.** `PinnedLines.__str__` answers a constant, exactly as
  `FormaRule.__str__` does, so the key is identical whether or not lines were sent — and the same
  cost follows, in the same words: the response does not say which lines ran, and a client that
  caches has to fold them into its own key.

The lines travel in a **body**, so they arrive on a `POST` beside the `GET` rather than on it. A
list has no bounded length and a URL does, and a body on a `GET` is not something clients, proxies
and caches agree about. Both verbs run one function over one pipeline builder; the `GET` is
untouched by any of this and stays the route a tick worker's window would use. See
`playbook_api.lines_body`.

**A run reads closed bars only.** The Ingestor writes the forming bar and keeps rewriting it, so
the newest row in any window is normally a bar still filling, and a Pattern reading it answers
about a bar the market has not given yet. It is withheld here, per Timeframe, before the engine
sees them — see `load_closed_candles`.

What counts as closed is decided by the data and not by a clock: **a bar is closed when a later
bar exists.** No instant is compared to anything, so the answer cannot depend on the caller's
clock, this server's, or the timescale the table happens to stamp its rows in — and that last one
is not hypothetical here, the `time` column carries exchange wall clock labelled as UTC. The cost
is stated plainly: when the feed stops, the last bar it wrote stays the newest row, so a session's
final bar is not read until the next session opens one past it.

`/candles` does not do this, deliberately — the chart draws the forming bar — so the monitor's
overlays end one bar behind its candles, and that gap is this paragraph rather than a defect. A
window that ends before the live edge loses nothing, so a pinned window is unaffected.

`symbol` and `timeframe` remain absent for the original reason: the pipeline names the Instrument
and each Pattern declares the Timeframes it reads. The caller chooses the window, and now the one
rule the browser cannot evaluate for itself.

One consequence for callers that cache: because the keys do not move, a window plus a producer no
longer names a response. A client that caches by window alone will serve one rule's marks for
another rule's request. The browser folds the rule into its cache key for exactly this reason.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pattern_engine import FormaRule, Pattern, PatternEngine
from sqlmodel import Session

from ..db import get_session
from ..lines_body import LinesIn, to_lines
from ..pipeline import PIPELINE, SYMBOL, build_pipeline, timeframes
from ..rule_query import rule_override
from ..schemas.pattern import PatternsOut, SeriesOut
from ..store.candles import CandleWindowTooLarge, as_series, load_closed_candles
from ..window import validate_window

router = APIRouter()

#: Matches `/candles`, so a window the chart can draw is a window the pipeline can run on.
DEFAULT_LIMIT = 1000


def _run(
    session: Session,
    pipeline: tuple[Pattern, ...],
    start: datetime,
    end: datetime,
    limit: int,
) -> PatternsOut:
    """One run of `pipeline` over the window's closed bars, whichever verb asked for it.

    The two handlers below differ only in what they build the pipeline from, so everything after
    that — the window, the bars, the engine, the serialisation — is here once. A second copy is
    the "both appearing to work" failure `pipeline.py`'s docstring is written against, arriving by
    a different door: two routes answering about two windows loaded two ways.

    A Pattern that raises does not stop the run (ADR-0004): the engine logs it and writes nothing
    under its key. That is reported as a name in `failed` rather than a 500, so one broken Pattern
    does not hide the ones that worked. The exception itself is only in the server log — the
    engine deliberately does not carry it.

    Note the asymmetry that creates for a rule: `marks` never raises on absurd numbers, it just
    marks nothing, so a bad rule produces an *empty* Series and not a failed one. Which is why
    `rule_query` refuses out-of-range thresholds up front — nothing downstream ever will. The
    same holds for a line: one whose bar is outside the window is answered with silence, not an
    error, because that is what the monitor already says about a pin that scrolled away.

    The bars handed over are the window's *closed* ones — the newest row of each Timeframe is the
    bar the Ingestor is still writing, and it is withheld. See the module docstring.
    """
    validate_window(start, end)

    try:
        bars = {
            timeframe: as_series(
                # `load_candles` with the forming bar withheld. `limit` still describes the
                # window that was asked for: an overflowing window is an error about what the
                # caller requested, not about what survived the trim.
                load_closed_candles(
                    session,
                    symbol=SYMBOL,
                    timeframe=timeframe,
                    start=start,
                    end=end,
                    limit=limit,
                ),
                symbol=SYMBOL,
                timeframe=timeframe,
            )
            # Asked about the pipeline actually being run, so the bars loaded and the Patterns
            # run can never come from two different tuples.
            for timeframe in sorted(timeframes(pipeline))
        }
    except CandleWindowTooLarge as too_large:
        raise HTTPException(
            400, f"window holds more than {too_large.limit} candles — narrow it or raise `limit`"
        ) from too_large

    engine = PatternEngine(bars, pipeline)
    ctx = engine.run()

    return PatternsOut(
        series={
            # Falling back to the key, so a Pattern added without a `name` shows *something*
            # readable rather than an empty label the screen cannot explain.
            pattern.producer: SeriesOut.from_series(
                ctx[pattern.producer], pattern.name or pattern.producer
            )
            for pattern in engine.patterns
            if pattern.producer in ctx
        },
        # The engine does not report who failed, but the pipeline is known, so the difference is.
        failed=[pattern.producer for pattern in engine.patterns if pattern.producer not in ctx],
    )


@router.get("/patterns", response_model=PatternsOut)
def read_patterns(
    session: Annotated[Session, Depends(get_session)],
    rule: Annotated[FormaRule | None, Depends(rule_override)],
    start: Annotated[datetime, Query(alias="from", description="Window start, ISO-8601 with offset")],
    end: Annotated[datetime, Query(alias="to", description="Window end, ISO-8601 with offset")],
    limit: Annotated[int, Query(gt=0, description="Ceiling, not a page size")] = DEFAULT_LIMIT,
) -> PatternsOut:
    """Run every declared Pattern over the window and return the Series they produced.

    Without an override this runs `PIPELINE` itself rather than rebuilding an equal tuple, so
    "no rule parameters" and "as before" are the same statement and not two that have to agree.
    `line-relations` is in that tuple with no lines, and answers an empty Series — the shape of
    the response is the same whichever verb asked.
    """
    pipeline = PIPELINE if rule is None else build_pipeline(rule)

    return _run(session, pipeline, start, end, limit)


@router.post("/patterns", response_model=PatternsOut)
def run_patterns(
    session: Annotated[Session, Depends(get_session)],
    rule: Annotated[FormaRule | None, Depends(rule_override)],
    body: LinesIn,
    start: Annotated[datetime, Query(alias="from", description="Window start, ISO-8601 with offset")],
    end: Annotated[datetime, Query(alias="to", description="Window end, ISO-8601 with offset")],
    limit: Annotated[int, Query(gt=0, description="Ceiling, not a page size")] = DEFAULT_LIMIT,
) -> PatternsOut:
    """The same run, for a caller holding lines the server has no way to know about.

    Every query parameter of the `GET` means the same thing here, `rule_override` included, so a
    caller does not choose between sending a rule and sending lines. The body is the only
    addition, and `line-relations` is the only Series it can change.

    `PIPELINE` is deliberately *not* reused when a rule is absent, as the `GET` reuses it: a
    pipeline carrying lines is by definition not the declared one, and pretending otherwise would
    make "the same object" stop meaning what the `GET` uses it to mean. The absent rule is left to
    `build_pipeline`'s own default rather than named again here, so `RULE_K` stays written once.
    """
    lines = to_lines(body)
    pipeline = build_pipeline(lines=lines) if rule is None else build_pipeline(rule, lines)

    return _run(session, pipeline, start, end, limit)
