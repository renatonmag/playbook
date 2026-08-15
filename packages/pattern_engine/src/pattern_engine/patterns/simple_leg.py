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

Every pullback leaves exactly one leg mark, with one exception: `leg_mark` is a bool per bar, so
two marks walking onto the same bar are one mark. That needs two legs to end one bar apart and
the bar between them to be engulfed — rare, and unrepresentable in this output shape rather than
merely unhandled.

`detect_initial_direction` is a *seed*, not a measurement of the trend. It reads the first pair
of bars that says something unambiguous and stops there; a series that opens with one up bar and
then falls for an hour is seeded `bull`, and `mark_pullbacks` corrects it at the first real
reversal. The price of that is one spurious mark near the start, paid knowingly — the
alternative is a confirmation window, which is a second, quieter opinion about what a trend is.
"""

import math

#: Prices are compared as integers so a comparison never turns on float noise.
SCALE = 100000


class PbMark:
    name = "simple"

    def __init__(self, data):
        self._data = [dict(bar) for bar in data]
        self._prev = None
        """The bar every comparison is made against — not always the previous one."""
        self._pending = False
        """A leg mark that has not found a bar to land on yet."""
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
        """Whether this bar begins a pullback, flipping the leg direction when it does."""
        if _missing(curr_bar):
            # A hole marks nothing and becomes nothing: adopting it as the reference would make
            # every later comparison false and silently end the marking there.
            return False
        if self._prev is None:
            self._prev = curr_bar
            return False
        if self._engulfs(curr_bar, self._prev):
            self._prev = curr_bar
            return False

        turned = False
        if self._direction == "bull":
            turned = integer(curr_bar["low"]) < integer(self._prev["low"])
        elif self._direction == "bear":
            turned = integer(curr_bar["high"]) > integer(self._prev["high"])

        self._prev = curr_bar
        if turned:
            self._direction = "bear" if self._direction == "bull" else "bull"
        return turned

    def find_outside_edges(self, curr_bar, next_bar, leg_mark):
        """Where a leg mark finally lands, once the bars that engulf it are stepped over.

        A carried mark is judged by the same rule as one of the bar's own, so a run of engulfing
        bars moves it along the whole run rather than dropping it on the first bar of it.
        """
        carried, self._pending = self._pending, False
        if not (carried or leg_mark):
            return False
        if next_bar is not None and self._engulfs(next_bar, curr_bar):
            self._pending = True
            return False
        return True

    def extract(self):
        self._prev = None
        self._pending = False
        self._direction = self.detect_initial_direction()

        pullbacks = [self.mark_pullbacks(bar) for bar in self._data]
        # A bar carries the mark of the leg that turns on the bar after it.
        leg_marks = pullbacks[1:] + [False]

        self._pending = False
        entries = []
        for index, bar in enumerate(self._data):
            next_bar = self._data[index + 1] if index + 1 < len(self._data) else None
            entries.append(
                {
                    **bar,
                    "pullback": pullbacks[index],
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
