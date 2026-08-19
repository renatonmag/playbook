"""The Forma rule a caller may hand to `/patterns`, read off the query string.

A sibling of `window.py`, and for the same reason: this is request-shaped validation that is
neither a route nor a store, and keeping it out of the route is what lets the words of an error
be written once. Two more reasons apply here. The mapping from short HTTP keys to `FormaRule`
fields is a translation table, and it belongs in a module named after the translation. And a
backtest route that one day takes the same override should get it by import rather than by copy.

**The keys are the ones the browser already writes.** `toQuery` in `apps/web/app/utils/rule.ts`
serialises a rule as `pre`, `wf`, `wc`, `wcr`, `bmin`, `bmax`, `cor`, `corb`, and that vocabulary
is named, documented and tested there. Spelling them `wf_min` and `wc_max_ratio` on the wire
would give one rule three spellings — the TypeScript field, the bench's URL, the HTTP query —
with a translation table nobody owns. The cost is that this file's Python parameter names do not
match its HTTP surface, which is exactly what `Query(alias=...)` is for, and it is confined here.

`name` and `dir` are declared only to be **refused**. FastAPI ignores query parameters it was
not told about, so a browser that spread `toQuery(rule)` straight into the request would send a
rule called `minha regra` looking for `alta`, receive one called `K` evaluated on the leg's own
side, and never be told the difference. That silence is the whole failure mode this module and
`parseRule` are written against, so the two keys answer 400 rather than going unread.
"""

import math
from typing import Annotated

from fastapi import HTTPException, Query
from pattern_engine import ColourMode, FormaRule

from .pipeline import RULE_K

#: What an override is always called. Derived from the declared rule rather than repeating the
#: literal `"K"`: `FormaRule.__str__` is what `Pattern.producer` renders into the `ctx` key, so
#: deriving it is what makes an overridden run and a default run answer under the same key *by
#: construction*. That equality is load-bearing on the screen — see `routers/patterns.py`.
OVERRIDE_NAME = RULE_K.name

#: The fields a rule has to state to be a rule. `wcr` is absent on purpose — see `rule_override`.
REQUIRED = ("pre", "wf", "wc", "bmin", "bmax", "cor", "corb")

#: The ceiling on `wcr`. It is a ratio, not a fraction, so `1` would be the wrong bound — but it
#: is also inert above `1` whenever `pre` is set, since `wc <= wf` already holds there. Ten is
#: generous headroom over the only region in which the dial does anything.
MAX_RATIO = 10.0


def rule_override(
    require_wf_over_wc: Annotated[
        bool | None, Query(alias="pre", description="The favourable shadow exists and beats the counter one")
    ] = None,
    wf_min: Annotated[float | None, Query(alias="wf", ge=0, le=1, description="`wf >=`")] = None,
    wc_max: Annotated[float | None, Query(alias="wc", ge=0, le=1, description="`wc <=`")] = None,
    wc_max_ratio: Annotated[
        str | None, Query(alias="wcr", description="`wc <= k*wf`; empty means no proportional frontier")
    ] = None,
    body_min: Annotated[float | None, Query(alias="bmin", ge=0, le=1)] = None,
    body_max: Annotated[float | None, Query(alias="bmax", ge=0, le=1)] = None,
    colour: Annotated[ColourMode | None, Query(alias="cor")] = None,
    colour_body_min: Annotated[float | None, Query(alias="corb", ge=0, le=1)] = None,
    name: Annotated[str | None, Query(alias="name", description="Refused: an override is always named K")] = None,
    direction: Annotated[str | None, Query(alias="dir", description="Refused: the leg decides the side")] = None,
) -> FormaRule | None:
    """The rule the caller asked for, or `None` when they asked for the declared one.

    The bounds are `[0, 1]` on every threshold but the ratio because `upper + lower + body == 1`
    by identity in `Shape` — that is the whole expressible space, and a value outside it is not a
    strict rule but a typo. `wf=49` is the mistake this catches: a percentage where a fraction
    was wanted. It matters more than it looks, because `marks` does not raise on nonsense; it
    simply marks nothing, and a Series of no marks reads exactly like a rule that found nothing.
    This function is the only layer that can tell the two apart.

    A rule is **all or nothing**. Seven of the eight fields must arrive together or not at all;
    per-field defaults were rejected because a rule with two numbers from the caller and five
    from a constant on this server is a rule nobody can name, while the screen would attribute
    its marks to `K`. `wcr` is exempt for the same reason `parseRule` exempts `wcMaxRatio`: `None`
    there is a real setting — no proportional frontier — so its absence says nothing about
    whether an override was meant. It cannot *trigger* one either, so `wcr` alone is refused.

    Violations of a single field's type or range are FastAPI's 422, matching what `limit` already
    does. Everything cross-field or semantic is a 400 with prose, matching the window.
    """
    # Before the presence check, so pasting a bench URL wholesale gets the honest error and not a
    # confusing complaint about a field that is in fact present.
    if name is not None:
        raise HTTPException(
            400, f"`name` is not read: an override is always named `{OVERRIDE_NAME}`, so the keys stay comparable"
        )
    if direction is not None:
        raise HTTPException(400, "`dir` is not read: the leg's side decides which reversal is looked for")

    supplied = {
        key
        for key, value in zip(
            REQUIRED,
            (require_wf_over_wc, wf_min, wc_max, body_min, body_max, colour, colour_body_min),
            strict=True,
        )
        if value is not None
    }

    if not supplied:
        if wc_max_ratio is not None:
            raise HTTPException(400, f"`wcr` alone is not a rule — send all of {', '.join(REQUIRED)}, or none")
        return None

    missing = [key for key in REQUIRED if key not in supplied]
    if missing:
        raise HTTPException(400, f"a rule states every field or none — missing: {', '.join(missing)}")

    ratio = _ratio(wc_max_ratio)

    # The one cross-field claim worth refusing. There is deliberately no ordering constraint
    # between `wf` and `wc`: `pre` is the field that expresses that claim, and a rule may want
    # either — see the note on `requireWfOverWc` in `rule.ts`.
    if body_min > body_max:  # type: ignore[operator]
        raise HTTPException(400, "`bmin` above `bmax` describes a rule that can mark nothing")

    return FormaRule(
        name=OVERRIDE_NAME,
        require_wf_over_wc=require_wf_over_wc,  # type: ignore[arg-type]
        wf_min=wf_min,  # type: ignore[arg-type]
        wc_max=wc_max,  # type: ignore[arg-type]
        wc_max_ratio=ratio,
        body_min=body_min,  # type: ignore[arg-type]
        body_max=body_max,  # type: ignore[arg-type]
        colour=colour,  # type: ignore[arg-type]
        colour_body_min=colour_body_min,  # type: ignore[arg-type]
    )


def _ratio(raw: str | None) -> float | None:
    """`wcr` as the number `FormaRule` wants, or `None` for no proportional frontier.

    Declared as a string and parsed here rather than typed `float | None`, because `toQuery`
    writes "no frontier" as `wcr=` — an empty string — and FastAPI answers 422 to that in a
    float, refusing the browser's own serialisation. Typing it as text is what makes the round
    trip close.

    `nan` is refused explicitly and is the reason this is a function rather than a `float()` call:
    it parses happily, and then every comparison against it in `marks` is false, so a rule that
    marks nothing comes back with no error attached to say why.
    """
    if raw is None or raw == "":
        return None

    try:
        ratio = float(raw)
    except ValueError:
        raise HTTPException(400, "`wcr` must be a number, or empty for no proportional frontier") from None

    if not math.isfinite(ratio):
        raise HTTPException(400, "`wcr` must be a finite number")
    if not 0 <= ratio <= MAX_RATIO:
        raise HTTPException(400, f"`wcr` must be between 0 and {MAX_RATIO:g}")

    return ratio
