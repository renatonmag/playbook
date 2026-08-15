"""The Shape of a Candle as the rule bench consumes it.

Mirrors `CandleOut` in shape and in spirit: `time` in Unix seconds, plain floats, and nothing
repeated that the request already named. What crosses the wire is a **measurement** — the three
proportions and the colour — never a verdict. Which shadow is "favourable" and whether a rule
marks the bar are the client's arithmetic, and keeping them there is what stops this route from
becoming a rule interpreter (see the docstring on `/patterns`).
"""

from typing import Self

from pattern_engine import Candle, Shape
from pydantic import BaseModel


class ShapeOut(BaseModel):
    """One Candle's proportions. `upper + lower + body == 1`.

    Direction-neutral, like `Shape` itself: a bench comparing a bearish rule against its bullish
    mirror reads these rows twice rather than asking the server for them twice.
    """

    time: int
    upper: float
    lower: float
    body: float
    bear: bool

    @classmethod
    def of(cls, candle: Candle, shape: Shape) -> Self:
        """The one place a measured Shape becomes wire data.

        `time` comes from the Candle rather than the Shape because a Shape has no anchor — it is
        proportions and nothing else. The bench needs the anchor to link a marked bar back to
        `/monitor`.
        """
        return cls(
            time=int(candle.time.timestamp()),
            upper=shape.upper,
            lower=shape.lower,
            body=shape.body,
            bear=shape.bear,
        )
