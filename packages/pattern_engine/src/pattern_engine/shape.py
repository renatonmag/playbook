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
