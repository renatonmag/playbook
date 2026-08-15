"""The Shape of a Candle as the rule bench consumes it.

Mirrors `CandleOut` in shape and in spirit: `time` in Unix seconds, plain floats, and nothing
repeated that the request already named. What crosses the wire is a **measurement** — the three
proportions, the colour, and the amplitude they were divided by — never a verdict. Which shadow
is "favourable" and whether a rule marks the bar are the client's arithmetic, and keeping them
there is what stops this route from becoming a rule interpreter (see the docstring on
`/patterns`).

Still not `/candles`: the prices themselves stay out. A bench needs to know that one bar was
twice the size of its neighbour; it does not need to know where either sat on the price scale,
and the moment `high` and `low` appear here the distinction between the two routes becomes a
matter of degree.
"""

from typing import Self

from pattern_engine import Candle, Shape
from pydantic import BaseModel


class ShapeOut(BaseModel):
    """One Candle's proportions, plus the size they were measured against.

    Direction-neutral, like `Shape` itself: a bench comparing a bearish rule against its bullish
    mirror reads these rows twice rather than asking the server for them twice.

    `upper + lower + body == 1`; `amplitude` is outside that sum and is the only field here
    carrying a magnitude.
    """

    time: int
    upper: float
    lower: float
    body: float
    bear: bool
    #: `high - low`, in the Instrument's own points. Deliberately **not** part of the Shape —
    #: issue #10 made amplitude the denominator precisely so the three proportions carry all the
    #: form and none of the size, and `Shape` in `pattern_engine` stays that way. It rides along
    #: here because a bench drawing several bars *side by side* needs a common scale: proportions
    #: alone make a 500-point bar and a 40-point one identical, and two bars drawn adjacent are
    #: read as a chart whether or not one was meant.
    amplitude: float

    @classmethod
    def of(cls, candle: Candle, shape: Shape) -> Self:
        """The one place a measured Shape becomes wire data.

        `time` and `amplitude` come from the Candle rather than the Shape because a Shape has
        neither — it is proportions and nothing else. The bench needs the anchor to link a marked
        bar back to `/monitor`, and the size to draw bars against each other.

        Both are measurements, not verdicts, so the line this route draws holds: what crosses the
        wire is what was measured, never whether a rule marks it.
        """
        return cls(
            time=int(candle.time.timestamp()),
            upper=shape.upper,
            lower=shape.lower,
            body=shape.body,
            bear=shape.bear,
            # No `float()`: `as_series` already did the `Decimal` conversion, in the one place
            # that owns it.
            amplitude=candle.high - candle.low,
        )
