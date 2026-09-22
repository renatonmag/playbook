"""Which of the declared Patterns one run executes, and whether it sees the forming bar.

The third sibling of `rule_query` and `lines_body`, and written for the same reason the two of
them are: this is request-shaped validation that is neither a route nor a store, and keeping it
out of the route is what lets the words of a refusal be written once.

What it reconciles is a harder thing than either of those, and worth stating plainly rather than
letting the code imply it. `routers/patterns.py` argues at length that **no caller adds a Pattern,
removes one, reorders them, or retunes them** — every exception it grants is a *parameter* handed
to a tuple whose shape never moves. `POST /patterns/custom` is the first route that lets a caller
change the shape, and the only thing keeping that from becoming "the browser authors the pipeline"
is that it can change it in exactly one direction.

**A caller narrows. It never composes.** `select` starts from a tuple `build_pipeline` produced, at
whatever tuning that function was asked for, and returns a subsequence of it — Patterns removed,
none added, and the survivors still in **declaration order** and not in the caller's. There is no
body this module could be handed that produces a pipeline `build_pipeline` cannot produce, and
there is no ordering it could ask for. That is the whole of the guard, and everything below is
detail.

**Two spellings name a Pattern**, and the second exists because of a fact about `pipeline.py`
rather than for convenience. The *class part* — `simple-leg`, the producer key up to its `(` — is
what the browser already speaks: `producerName()` in `apps/web/app/types/pattern.ts` splits a key
exactly there, and every `OVERLAYS` entry on the monitor is keyed by it. But five classes are
declared twice in `pipeline.py` — `LegReachPattern`, `RetracementPattern`, `LegPattern`,
`LegExtremesPattern` and `LineRespectPattern`, each once per source — so a class part names
**both** instances. That is answered as what it is rather than refused as ambiguous: "run
`leg-extremes`" is a sensible thing to mean, and what it means is both of them. A caller wanting
one of a pair spells the **whole producer key**, which is unique by construction and is the key
the response comes back under either way.

**A name matching nothing is a 400**, and that is the one refusal here that earns its keep. The
alternative is an empty `series` — which is exactly what a selection of Patterns that ran and found
nothing looks like, so a typo would answer 200 with a response nobody could tell from a real one.
It is `rule_query`'s `name`/`dir` refusal arriving through a different door: the failure being
prevented is silence, not wrongness.

**A Pattern selected without its source is not refused**, and that is deliberate rather than
unfinished. Nothing declares what a Pattern consumes — decision 5 of issue #3, restated in
CONTEXT.md — so the transitive closure of a selection is not computable from anything this module
can see. The consequence is already specified: the Pattern raises `KeyError` on a key that is not
in `ctx`, ADR-0004 logs it and writes nothing, and the route reports it by name in `failed`. So
`{"patterns": ["leg-extremes"]}` answers 200 with one name in `failed` and no Series, which is the
honest report and not an error.

**The forming bar** is the other half of the body and is not a Pattern-shaped decision at all —
it is which rows the run is handed. `edge` names the two loaders `store/candles` already has, and
the docstring on the route says what the choice costs.
"""

from typing import Literal

from fastapi import HTTPException
from pattern_engine import Pattern
from pydantic import BaseModel, Field

from .lines_body import LinesIn
from .pipeline import PIPELINE

#: Which rows a run is handed: the window's closed Candles, or every row in it.
#:
#: A `Literal` rather than a bool because the two are not "on" and "off" of one thing — they are
#: two policies with two names, and `edge=True` at a call site says neither of them.
Edge = Literal["closed", "forming"]

#: How many names one selection may carry: the declared pipeline's own length.
#:
#: Derived rather than chosen, which is the difference from `MAX_LINES` and `MAX_PROXIMITY_LEVELS`
#: next door. Those are ceilings on a question — a person pins lines by hand and a hundred of them
#: is a client bug — and a number had to be guessed for each. This one is a fact: a selection is a
#: subsequence of `PIPELINE`, so a body naming more Patterns than `PIPELINE` holds cannot be one
#: whatever its names say, and `select` was going to refuse it a line later anyway. What the
#: ceiling buys is that the refusal is FastAPI's 422 about the body's shape rather than a 400 about
#: its contents, which is the right register for "this cannot be a selection at all".
MAX_SELECTED = len(PIPELINE)


class CustomRunIn(LinesIn):
    """A narrowed run: which Patterns, over which rows, plus everything `POST /patterns` takes.

    It extends `LinesIn` rather than standing beside it because a narrowed run is the same
    question asked of fewer Patterns, not a different question. A caller selecting
    `line-relations` needs the lines exactly as the unnarrowed `POST` does, and a second body
    type that happened to carry the same three lists would be two shapes to keep in step.

    `patterns` has no default. The empty selection is a real thing to want and it already has a
    route — `/patterns` — so spelling it here would give one intent two spellings, and one of them
    would run this route's extra validation to arrive at the same tuple.
    """

    patterns: list[str] = Field(min_length=1, max_length=MAX_SELECTED)
    #: Defaulted to `closed`, so this route's silence means what every other route's silence means.
    edge: Edge = "closed"


def head(producer: str) -> str:
    """A producer key's class part — `simple-leg(reads=5m,emits=5m)` becomes `simple-leg`.

    The Python twin of `producerName` in `apps/web/app/types/pattern.ts`, split at the same
    character for the same reason, and the two are a pair that has to agree: the browser sends
    what it read off a key this server minted.

    Derived here rather than exposed on `Pattern`, which would be the tempting home for it. The
    engine's `producer` is deliberately total — every parameter, and every parameter of every
    source — because it is a dict key; a second, shorter name on the same object would be a second
    thing a Pattern is called, and the one place that wants it is this route.
    """
    return producer.split("(")[0]


def select(pipeline: tuple[Pattern, ...], names: list[str]) -> tuple[Pattern, ...]:
    """The Patterns of `pipeline` that `names` asks for, in `pipeline`'s order.

    The caller's order is discarded, and that is the point rather than a simplification: declaration
    order is run order, a slicer ahead of its detector reads a key that is not in `ctx` yet, and
    nothing about a list of names in a JSON body is qualified to decide that. Honouring it would
    hand a caller the one power this route exists to withhold.

    A name matches by whole producer key or by class part — see the module docstring, including why
    a class part naming two instances returns both.

    Raises 400 on a name that matches nothing, naming it. Duplicates in `names` are ignored rather
    than refused: they select the same Patterns, the result is a subsequence either way, and a
    refusal would be a rule about the request's tidiness rather than about what it asked for.
    """
    wanted = set(names)
    chosen = tuple(
        pattern
        for pattern in pipeline
        if pattern.producer in wanted or head(pattern.producer) in wanted
    )

    matched = {name for pattern in chosen for name in (pattern.producer, head(pattern.producer))}
    unknown = sorted(wanted - matched)
    if unknown:
        raise HTTPException(
            400,
            f"no Pattern in the pipeline is called `{unknown[0]}`"
            + (f" (and {len(unknown) - 1} more)" if len(unknown) > 1 else ""),
        )

    return chosen
