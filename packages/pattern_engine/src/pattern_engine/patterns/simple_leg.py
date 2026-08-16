"""Where each pullback begins — the simplest reading of a leg.

`PbMark` walks the bars once and answers two things per bar: whether it begins a pullback
(`pullback`), and whether it carries the mark that closes the leg before it (`leg_mark`). It
speaks `list[dict]` in and `list[dict]` out, the same shape `ZigZagIndidicator` uses, and reads
only `high`, `low` and `close` — every other key rides through untouched.

Three rules carry the whole thing:

- A bull leg turns on a lower low, a bear leg on a higher high. That turn is the pullback.
- A bar that takes out *both* extremes marks nothing: the turn rule and the continuation rule
  both fire on it, so marking either would be a coin toss. It still becomes the reference the
  next bar is measured against, so a later turn has to clear the range it already covered.
- A mark sitting on a bar that its neighbour engulfs walks forward until it lands on a bar that
  stands on its own.

`leg_mark` is not a flag but a side — `"high"`, `"low"`, or `None` for no mark. A bull leg ends
at a high and a bear leg at a low, so the side is the leg's own direction read at the instant it
turns. It travels *with* the mark rather than in a column of its own precisely because the mark
moves: a mark carried over engulfing bars can land on the bar that begins the next leg, and a
column indexed at the landing bar would report the side of the wrong leg.

Every pullback leaves exactly one leg mark, with one exception: a bar holds one `leg_mark`, so
two marks walking onto the same bar are one mark. That needs two legs to end one bar apart and
the bar between them to be engulfed — rare, and unrepresentable in this output shape rather than
merely unhandled.

`detect_initial_direction` is a *seed*, not a measurement of the trend. It reads the first pair
of bars that says something unambiguous and stops there; a series that opens with one up bar and
then falls for an hour is seeded `bull`, and `mark_pullbacks` corrects it at the first real
reversal. The price of that is one spurious mark near the start, paid knowingly — the
alternative is a confirmation window, which is a second, quieter opinion about what a trend is.

`SimpleLegPattern` at the bottom is the adapter that makes this a Pattern — the same split
`zigzag.py` uses, and for the same reason: the algorithm speaks dicts and knows nothing about
Series, so its interface can change without the semantics moving underneath.
"""

import math
from dataclasses import dataclass
from typing import Literal

from ..candles import Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe

#: Prices are compared as integers so a comparison never turns on float noise.
SCALE = 100000

#: Which extreme of the bar a leg running this way ends on.
SIDES: dict[str, Literal["high", "low"]] = {"bull": "high", "bear": "low"}


class PbMark:
    name = "simple"

    def __init__(self, data):
        self._data = [dict(bar) for bar in data]
        self._prev = None
        """The bar every comparison is made against — not always the previous one."""
        self._pending = None
        """The side of a leg mark that has not found a bar to land on yet."""
        self._direction = None

    def detect_initial_direction(self):
        """The direction of the first pair of bars that says something unambiguous.

        Each pair is read on its own — nothing carries over — and two of the three readings have
        to agree *on that same pair*. A bar where price only ticked its low says one thing, and
        one thing is not a direction.

        The seed found at pair `k` is applied from bar 0, which is deliberate: this is where the
        leg is assumed to have been running, not where it was proven to.
        """
        for prev_bar, curr_bar in zip(self._data, self._data[1:]):
            votes = [
                _vote(curr_bar["low"], prev_bar["low"]),
                _vote(curr_bar["high"], prev_bar["high"]),
                _vote(curr_bar["close"], prev_bar["close"]),
            ]
            for direction in ("bull", "bear"):
                if votes.count(direction) >= 2:
                    return direction
        return None

    def mark_pullbacks(self, curr_bar):
        """The side of the leg this bar's turn closes — `"high"`, `"low"`, or `None` for no turn.

        Returning the side rather than a bare `True` is what keeps it attached to the mark. It
        is read off `_direction` *before* the flip: the leg that just ended is the one being
        priced, and one line later that state belongs to the leg starting here.
        """
        if _missing(curr_bar):
            # A hole marks nothing and becomes nothing: adopting it as the reference would make
            # every later comparison false and silently end the marking there.
            return None
        if self._prev is None:
            self._prev = curr_bar
            return None
        if self._engulfs(curr_bar, self._prev):
            self._prev = curr_bar
            return None

        turned = False
        if self._direction == "bull":
            turned = integer(curr_bar["low"]) < integer(self._prev["low"])
        elif self._direction == "bear":
            turned = integer(curr_bar["high"]) > integer(self._prev["high"])

        self._prev = curr_bar
        if not turned:
            return None
        ended = self._direction
        self._direction = "bear" if ended == "bull" else "bull"
        return SIDES[ended]

    def find_outside_edges(self, curr_bar, next_bar, leg_mark):
        """Where a leg mark finally lands, once the bars that engulf it are stepped over.

        A carried mark is judged by the same rule as one of the bar's own, so a run of engulfing
        bars moves it along the whole run rather than dropping it on the first bar of it. The
        side rides along untouched: walking forward changes which bar prices the vertex, never
        which way the leg that ended was running.
        """
        carried, self._pending = self._pending, None
        side = carried or leg_mark
        if side is None:
            return None
        if next_bar is not None and self._engulfs(next_bar, curr_bar):
            self._pending = side
            return None
        return side

    def extract(self):
        self._prev = None
        self._pending = None
        self._direction = self.detect_initial_direction()

        sides = [self.mark_pullbacks(bar) for bar in self._data]
        # A bar carries the mark of the leg that turns on the bar after it.
        leg_marks = sides[1:] + [None]

        self._pending = None
        entries = []
        for index, bar in enumerate(self._data):
            next_bar = self._data[index + 1] if index + 1 < len(self._data) else None
            entries.append(
                {
                    **bar,
                    # A bool, not the side: this column says a leg turned here, and the side
                    # belongs to the leg that ended — which is the mark's business, not this
                    # bar's.
                    "pullback": sides[index] is not None,
                    "leg_mark": self.find_outside_edges(bar, next_bar, leg_marks[index]),
                }
            )
        return entries

    @staticmethod
    def _engulfs(outer, inner):
        """Whether `outer` takes out both of `inner`'s extremes."""
        return integer(outer["high"]) > integer(inner["high"]) and integer(outer["low"]) < integer(
            inner["low"]
        )

    def __call__(self):
        return self.extract()


def _vote(current, previous):
    """Which way one reading moved, or `None` when it tied or is missing."""
    if integer(current) > integer(previous):
        return "bull"
    if integer(current) < integer(previous):
        return "bear"
    return None


def _missing(bar):
    return any(bar.get(key) is None or bar[key] != bar[key] for key in ("high", "low"))


def integer(value):
    """A price as a scaled integer, and `nan` for one that is not there.

    `round`, not `int`: `1.14729 * SCALE` lands on `114728.99999999999`, and truncating it gives
    the value one tick below — two distinct lows comparing equal, and a pullback lost.

    Every caller feeds the result straight into `<` or `>`, so a missing price has to come back
    orderable. `nan` compares false either way and the bar simply marks nothing; `None` raised
    `TypeError` and took the run down with it.
    """
    if value is None or value != value:  # `!=` itself is the NaN test
        return math.nan
    return round(value * SCALE)


@dataclass(frozen=True, slots=True)
class LegMark(Pivot):
    """Where a leg ended: the bar carrying the mark, and which of its extremes the vertex is.

    No `since`. Unlike `ZigZagPivot`, the beginning of the leg ending here *is* the previous
    Point of this Series, so carrying it would be restating what the ordering already says.
    """

    direction: Literal["high", "low"]


class SimpleLegPattern(Pattern):
    """`PbMark` as a Pattern: a Series of the bars where legs ended.

    Output is **sparse** — one Point per leg mark, not one per Candle, though far denser than a
    zigzag of any useful depth. This rule has no smoothing at all: on real 5m bars it marks a
    leg roughly every three bars where `zig-zag(depth=8)` finds a vertex every twelve.

    `price` is the extreme of the **marked bar**, which is not always the extreme of the leg.
    The turn rule reads one side at a time — a bull leg turns on a lower low and never looks at
    the highs — so a leg can top out several bars before the bar that marks its end. That gap is
    the rule's own behaviour and is left visible rather than repaired here; moving the price to
    the leg's true extreme would be a second opinion about where a leg ends, living in the
    adapter instead of in the rule.
    """

    def __init__(self, *, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries[LegMark]:
        """Walk `emits`' Candles once and pack the bars that came back marked.

        `PbMark`'s output is dense and parallel to its input, so `zip` is what pairs a record
        back to the Candle it came from — no lookup by `time`, and the marker never learns that
        bars have times at all.
        """
        bars = ctx[BARS][self.emits]
        raw = PbMark([{"high": bar.high, "low": bar.low, "close": bar.close} for bar in bars])()

        points = [
            LegMark.anchored(
                bar,
                price=bar.high if entry["leg_mark"] == "high" else bar.low,
                direction=entry["leg_mark"],
            )
            for bar, entry in zip(bars, raw)
            if entry["leg_mark"] is not None
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
