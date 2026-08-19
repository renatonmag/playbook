"""The Shape of a Candle — its three parts as fractions of its amplitude.

Decided in [issue #10](https://github.com/renatonmag/playbook/issues/10): the amplitude
`H − L` is the *denominator*, not a fourth number. Divide by it and the three parts sum to one
by identity, so amplitude is pure size and carries no shape at all. Two Candles with the same
proportions and different sizes are the same Shape.

This is the feature extraction the Forma factor is built on. It lives here rather than in the
API so the screen that judges a rule and the Pattern that later runs it measure the same thing
— a formula written twice is a formula that diverges in silence.
"""

from dataclasses import dataclass
from typing import Literal

from .candles import Candle

#: Which reversal a rule is looking for. The bullish bar is the vertical mirror of the bearish
#: one — see the charting decisions on issue #9 — so it is one problem, not two.
Direction = Literal["bearish", "bullish"]


@dataclass(frozen=True, slots=True)
class Shape:
    """One Candle's proportions. `upper + lower + body == 1`, always.

    Deliberately **direction-neutral**: it holds the upper and lower shadows, not the
    "favourable" and "counter" ones. Which shadow is which depends on the reversal being looked
    for, and that is the caller's question — `facing` answers it.
    """

    upper: float
    lower: float
    body: float
    bear: bool

    def facing(self, direction: Direction) -> tuple[float, float]:
        """`(wf, wc)` — the favourable shadow and the counter one, for this direction.

        A bearish reversal bar rejects higher prices, so its favourable shadow is the upper one
        and the counter shadow sits on the closing side. The bullish bar is the mirror. This
        single swap is what lets one rule, one dataset and one Pattern class serve both.
        """
        return (self.upper, self.lower) if direction == "bearish" else (self.lower, self.upper)

    def agrees(self, direction: Direction) -> bool:
        """Whether the body's colour matches the reversal.

        With the counter shadow near zero the bottom of the body sits on the bar's extreme, and
        which end of the body that is depends on the colour: a bearish body puts the *close*
        there, a bullish one puts the *open*. Only the first is a reversal. A bodyless Candle
        has no colour to disagree with, so it agrees with both.
        """
        if self.body == 0:
            return True
        return self.bear if direction == "bearish" else not self.bear


def shape_of(candle: Candle) -> Shape | None:
    """The Shape of one Candle, or `None` when it has no amplitude.

    `high == low` is a Candle that traded at a single price. It has no proportions — the
    division would be by zero — and returning `None` says so rather than inventing a Shape
    nobody measured. It is rare but real: three such bars sit in the `5m` history of `WIN@N`.
    """
    amplitude = candle.high - candle.low
    if amplitude <= 0:
        return None

    top, bottom = max(candle.open, candle.close), min(candle.open, candle.close)

    return Shape(
        upper=(candle.high - top) / amplitude,
        lower=(bottom - candle.low) / amplitude,
        body=(top - bottom) / amplitude,
        bear=candle.close < candle.open,
    )


#: When a rule requires the body's colour to match the reversal.
#:
#: `acima-de` is the conditional form issue #10 described — colour only matters once the body is
#: big enough for open and close to be in different places. `sempre` is the strict reading.
#: Spelled in Portuguese because these are the values written in `docs/forma/rules.json`, and a
#: translation here would be a second name for one thing.
ColourMode = Literal["sempre", "acima-de", "nunca"]


@dataclass(frozen=True, slots=True)
class FormaRule:
    """A candidate Forma rule: the thresholds a Candle's Shape has to satisfy to be marked.

    The port of `Rule` in `apps/web/app/utils/rule.ts`, with **one field deliberately missing**.
    That file's `Rule` carries a `direction`, because the bench on `/rules` studies one side at a
    time. A Pattern does not: the direction it looks for is a property of the *leg* it is inside
    — a leg closing on a low wants a bullish bar, one closing on a high wants a bearish one — so
    `marks` takes the direction as an argument and this dataclass never states one. The same
    seven numbers then serve both sides, which is exactly what `Shape.facing` is for.

    This is a second implementation of arithmetic that already exists in TypeScript, and nothing
    checks the two against each other. That was decided with eyes open: the bench has to run in
    the browser with no round trip, and the Pattern has to run in the engine. The defence is that
    both are small, both are documented, and `/verify` puts their output side by side.
    """

    #: What the rule is called in `docs/forma/rules.json`. Carried for display, and rendered into
    #: the producer key by `__str__` — so two rules that share a name share a key, whatever their
    #: numbers say. `sameRule` in the TypeScript excludes the name for the opposite reason.
    name: str
    #: The pre-filter of issue #10: the favourable shadow exists and beats the counter one.
    require_wf_over_wc: bool
    #: `wf >=` — the floor on the favourable shadow.
    wf_min: float
    #: `wc <=` — the ceiling on the counter shadow, as a fraction of the amplitude.
    wc_max: float
    #: `wc <= ratio * wf` — a diagonal frontier instead of a flat one; `None` when unused.
    #: Applied on top of `wc_max`, so a rule can state both and the tighter one wins.
    wc_max_ratio: float | None
    body_min: float
    body_max: float
    colour: ColourMode
    #: Only read when `colour` is `acima-de`.
    colour_body_min: float

    def __str__(self) -> str:
        """The rule's name, which is what `Pattern.producer` renders into the key.

        The alternative was the fields, which cannot collide. The name was chosen for a key that
        a person can read, at the stated cost: two rules called `K` with different numbers write
        to the same `ctx` key, and the second silently replaces the first.
        """
        return self.name


def colour_agrees(rule: FormaRule, shape: Shape, direction: Direction) -> bool:
    """Whether the body's colour satisfies the rule, for the reversal being looked for.

    Delegates the actual colour test to `Shape.agrees`, which already answers it — including for
    a bodyless Candle, which has no colour to disagree with. The two early exits here are the
    rule's business, not the Shape's: whether colour is being asked about at all.
    """
    if rule.colour == "nunca":
        return True
    if rule.colour == "acima-de" and shape.body <= rule.colour_body_min:
        return True
    return shape.agrees(direction)


def marks(rule: FormaRule, shape: Shape, direction: Direction) -> bool:
    """Whether this rule marks this Shape as a reversal bar in `direction`.

    The port of `marks` in `apps/web/app/utils/rule.ts`, tested in the same order so the two read
    alike. Takes a `Shape` and nothing else — no anchor, no size — because that is all it reads.
    """
    wf, wc = shape.facing(direction)
    if rule.require_wf_over_wc and not (wf > 0 and wf > wc):
        return False
    if wf < rule.wf_min or wc > rule.wc_max:
        return False
    if rule.wc_max_ratio is not None and wc > rule.wc_max_ratio * wf:
        return False
    if shape.body < rule.body_min or shape.body > rule.body_max:
        return False
    return colour_agrees(rule, shape, direction)
