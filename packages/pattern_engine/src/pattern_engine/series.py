"""Series — the single currency the engine passes around. See ADR-0002.

A Series is a list of Points, ordered by `time`. `BaseSeries` is concrete: a subclass only
fixes the Point type, so a new Pattern costs one Candle subclass and no Series subclass at
all. Candles are the base case; a Pattern's output is a Series like any other.
"""

from bisect import bisect_right
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Iterator

from .candles import Candle
from .timeframes import Timeframe

#: The producer of a Series of Candles — the base case, made by no Pattern.
CANDLES = "candles"


@dataclass(frozen=True, slots=True)
class SeriesIdentity:
    """Who a Series is: the Pattern that made it, for which Instrument, at which Timeframe.

    It lives on the Series object, not only in a lookup key, so an injected Series is
    self-describing and serialized output carries its provenance.
    """

    producer: str
    instrument: str
    timeframe: Timeframe

    def to_dict(self) -> dict[str, str]:
        return {
            "producer": self.producer,
            "instrument": self.instrument,
            "timeframe": self.timeframe,
        }


class BaseSeries[TPoint: Candle]:
    """An ordered run of Points for one Instrument at one Timeframe.

    Nothing here is abstract, and this is the whole surface: `identity`, `points`, `s[i]`,
    `len`/`iter`/`bool`, `as_of` and `to_dict`. An empty Series is falsy — `if breakouts:`
    is the trigger test.
    """

    __slots__ = ("_identity", "_points", "_anchors")

    def __init__(self, identity: SeriesIdentity, points: tuple[TPoint, ...] | list[TPoint]):
        self._identity = identity
        self._points: tuple[TPoint, ...] = tuple(points)
        self._anchors: list[datetime] = [p.time for p in self._points]
        # Ordering is not fixed up here: sorting in silence would hide a Pattern that packs
        # its Points wrong, and `as_of` is a bisect that depends on this being true.
        if any(b < a for a, b in zip(self._anchors, self._anchors[1:])):
            raise ValueError(
                f"points of {identity.producer} are not ordered by `time`"
            )

    @property
    def identity(self) -> SeriesIdentity:
        return self._identity

    @property
    def points(self) -> tuple[TPoint, ...]:
        return self._points

    def __getitem__(self, index: int) -> TPoint:
        return self._points[index]

    def __len__(self) -> int:
        return len(self._points)

    def __iter__(self) -> Iterator[TPoint]:
        return iter(self._points)

    def __bool__(self) -> bool:
        return bool(self._points)

    def __repr__(self) -> str:
        return f"<Series {self._identity.producer} {self._identity.instrument} {self._identity.timeframe} n={len(self)}>"

    def as_of(self, t: datetime) -> TPoint | None:
        """The last Point whose `time` is at or before `t`, or None if there is none.

        This is the whole of what a Series offers for correlating with another Series. It
        carries no policy: no resampling, no forward-filling into a finer grid. Being a
        search rather than index arithmetic, it is tolerant of gaps by construction.
        """
        i = bisect_right(self._anchors, t)
        return self._points[i - 1] if i else None

    def to_dict(self) -> dict[str, Any]:
        """Total serialization — this is what reaches Validation and the development UI."""
        return {
            "identity": self._identity.to_dict(),
            "points": [asdict(p) for p in self._points],
        }
