"""The zigzag — a chart's alternating run of tops and bottoms.

Two things live here. `ZigZagIndidicator` is the algorithm: it speaks in dicts of `high`/`low`
and answers with dense lists parallel to the input, mostly `None`. `ZigZagPattern` is the
adapter that makes it a Pattern — it translates in both directions and packs the surviving
vertices into a Series.

The split is deliberate: wrapping the algorithm rather than rewriting it means the interface
can change without the semantics moving underneath.

One defect has been fixed in place, because it was the algorithm lying to itself rather than a
matter of taste — `_find_extremes` moved `last_high_idx`/`last_low_idx` whenever the rolling
extreme *value* changed, including when the old extreme merely slid out of the window, so the
indices pointed at bars that were the extreme of nothing. See the comment there. It does not
move any vertex: `zz`, `highs` and `lows` are unchanged, and only `start` (`ZigZagPivot.since`)
gets better.

`start` marks where a leg turned: the extreme that was *current at that instant*, which is not
the same thing as the vertex the cleanup later elects. If price goes on to a lower low, the
vertex moves there, but the leg turned where it turned — so a mark sitting between two vertices
is the normal case and the useful one, not a defect. `_update_legs` writing it once and never
revising it is what makes it mean that. A `_refine_start_points` used to delete every mark
strictly between two vertices, which threw away roughly two thirds of them and left the chart
with almost nothing to draw; it is gone.

What is still broken, and deliberately left alone:

- A bar that is both the window's high and its low registers no turn, because `_update_legs`
  compares the two indices with a strict `<` and they are then equal. Outside bars — exactly
  the reversal bars this is meant to catch — are what produce that tie.
- `depth` is unvalidated: `0` raises out of `max()`, and anything past `len(data)` silently
  returns an empty result.
"""

from dataclasses import dataclass
from typing import Literal

from ..candles import Candle, Pivot
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe


class ZigZagIndidicator:
    def __init__(self, data, depth):
        """
        Initializes the ZigZag indicator with a list of candle data and a specified depth.

        :param data: List of dictionaries representing candle data.
        :param depth: Integer representing the depth for finding extremes.
        """
        self._data = data.copy()
        self._depth = depth
        self._size = len(self._data)
        self._initialize_arrays()

    def _initialize_arrays(self):
        self.highs = [None] * self._size
        self.lows = [None] * self._size
        self.start = [None] * self._size
        self.zz = [None] * self._size

    def _find_extremes(self):
        if self._size == 0:
            return

        last_high = self._data[0]["high"]
        last_low = self._data[0]["low"]
        last_high_idx = last_low_idx = 0
        leg_up = leg_down = False

        # The loop runs one past the last bar so the final window — the only one that holds
        # the last candle — is considered too.
        for idx in range(self._depth, self._size + 1):
            window = self._data[idx - self._depth : idx]
            current_max = max(candle["high"] for candle in window)
            current_min = min(candle["low"] for candle in window)

            made_high, made_low = self._update_highs_lows(
                idx, current_max, current_min, last_high, last_low
            )

            # The index moves only when the bar that just entered *made* the extreme; the
            # value tracks the window unconditionally. Tying the index to the value — as this
            # did — moved it whenever the old extreme merely slid off the left of the window,
            # leaving `last_high_idx` on a bar that is the maximum of nothing. `_update_legs`
            # then read `self.highs[last_high_idx]`, still `None`, and wrote that into `start`
            # while flipping the leg flag anyway, so the leg counted as started and its real
            # beginning was never recorded.
            #
            # The value must still be free to fall: it is the rolling maximum, and a downtrend
            # makes each new top lower than the last one that slid away.
            if made_high:
                last_high_idx = idx - 1
            if made_low:
                last_low_idx = idx - 1
            last_high, last_low = current_max, current_min

            leg_up, leg_down = self._update_legs(
                idx, last_high_idx, last_low_idx, leg_up, leg_down
            )

        self._cleanup_extremes()

    def _update_highs_lows(self, idx, current_max, current_min, last_high, last_low):
        """Mark the bar that just entered the window as a candidate, and say whether it did.

        Returning the two flags is what keeps the caller from restating this condition: it is
        the single place that decides a bar made an extreme, so the index and the recorded
        value cannot drift apart.

        `bar` covers the final `idx == self._size` pass without a branch — `idx - 1` is then
        `self._size - 1`, the last bar, which is the same slot the loop would reach anyway.
        """
        bar = idx - 1
        made_high = current_max == self._data[bar]["high"] and last_high != current_max
        made_low = current_min == self._data[bar]["low"] and last_low != current_min
        if made_high:
            self.highs[bar] = current_max
        if made_low:
            self.lows[bar] = current_min
        return made_high, made_low

    def _update_legs(
        self,
        idx,
        last_high_idx,
        last_low_idx,
        leg_up,
        leg_down,
    ):
        if not leg_up and last_high_idx < last_low_idx:
            self.start[last_low_idx] = self.lows[
                last_low_idx
            ]
            leg_up, leg_down = True, False
        elif not leg_down and last_low_idx < last_high_idx:
            self.start[last_high_idx] = self.highs[
                last_high_idx
            ]
            leg_up, leg_down = False, True
        return leg_up, leg_down

    def _cleanup_extremes(self):
        for idx in range(self._size):
            self._cleanup_highs(idx)
            self._cleanup_lows(idx)

    def _cleanup_highs(self, idx):
        if self.highs[idx] is not None:
            self.zz[idx] = self.highs[idx]
            for last in reversed(range(idx)):
                if self._cleanup_condition(
                    last, idx, self.highs
                ):
                    break

    def _cleanup_lows(self, idx):
        if self.lows[idx] is not None:
            self.zz[idx] = self.lows[idx]
            for last in reversed(range(idx)):
                if self._cleanup_condition(
                    last, idx, self.lows
                ):
                    break

    def _cleanup_condition(self, last, idx, arr):
        if self.zz[last] is not None:
            if self.zz[last] != arr[last]:
                return True
            if (
                arr is self.highs
                and self.zz[last] >= self.zz[idx]
            ) or (
                arr is self.lows
                and self.zz[last] <= self.zz[idx]
            ):
                self.zz[idx] = None
                arr[idx] = None
                return True
            else:
                self.zz[last] = None
                arr[last] = None
                return True
        return False

    def _finalize_data(self):
        finalized_data = []
        for idx in range(self._size):
            entry = {
                "zz": self.zz[idx],
                "lows": self.lows[idx],
                "highs": self.highs[idx],
                "start": self.start[idx],
            }
            finalized_data.append(entry)
        return finalized_data

    def __call__(self):
        self._find_extremes()
        return self._finalize_data()

    @staticmethod
    def zz_direction(entry):
        if entry["zz"] is not None:
            if entry["zz"] == entry["highs"]:
                return -1
            else:
                return 1
        return 0


@dataclass(frozen=True, slots=True)
class ZigZagPivot(Pivot):
    """One vertex of the zigzag: the bar, the price of the vertex, and which side of the bar.

    `since` is the Candle where the leg ending here began — the extreme that was current when
    the leg turned, which is **not** always the previous vertex: it is read before the
    algorithm's cleanup, so it can sit on a bar the cleanup later discarded. That difference is
    the whole reason it is carried rather than derived.
    """

    direction: Literal["high", "low"]
    since: Candle | None


class ZigZagPattern(Pattern):
    """The zigzag as a Pattern: a Series of alternating tops and bottoms.

    Output is **sparse** — one Point per surviving vertex, not one per Candle. A window of 500
    bars at `depth=5` yields a few dozen Points, and the leg between two of them is the segment
    joining consecutive Points.
    """

    name = "Zig-zag"

    def __init__(self, *, depth: int, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)
        self.depth = depth

    def run(self, ctx: Ctx) -> BaseSeries[ZigZagPivot]:
        """Run the indicator over `emits`' Candles and pack the vertices it kept.

        Which side of the bar a vertex is on is read from `highs`/`lows` being populated, not
        from comparing `zz` against them — the comparison is ambiguous on any bar where
        `high == low`, which a doji or an auction produces for real. See `_side` for the case
        where a bar is marked on both.

        `since` names the bar where the leg ending here turned. That bar is usually **not** a
        vertex, and that is the point of carrying it: it is where the extreme was current when
        the leg began, which the vertex the cleanup elects afterwards does not tell you. Read
        it as a bar of the window, never as a Point of this Series.

        It is not guaranteed. A leg that registered no turn at all leaves the range empty, and
        `_last_start` returns `None` rather than inventing one — a hole to read as "not
        recorded", not as "turned here". See the module docstring for what still causes those.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]
        raw = ZigZagIndidicator([{"high": bar.high, "low": bar.low} for bar in bars], self.depth)()

        points: list[ZigZagPivot] = []
        previous = -1
        for index in (i for i, entry in enumerate(raw) if entry["zz"] is not None):
            start = _last_start(raw, after=previous, upto=index)
            points.append(
                ZigZagPivot.anchored(
                    bars[index],
                    price=raw[index]["zz"],
                    direction=_side(raw[index]),
                    since=bars[start] if start is not None else None,
                )
            )
            previous = index

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)


def _side(entry: dict) -> Literal["high", "low"]:
    """Which extreme of the bar the vertex is, read from which array holds it.

    A bar can be marked in **both** `highs` and `lows`, and then the two disagree about what the
    vertex is. The algorithm settles it by order: `_cleanup_extremes` applies `_cleanup_highs`
    first and `_cleanup_lows` second, so the low overwrites `zz` and wins. Reading `highs` first
    here would name the loser — which showed up on real B3 bars as a vertex labelled `high`
    priced at the bar's low, breaking the top/bottom alternation.

    Deliberately not `zz == highs`: on a bar where `high == low` that comparison cannot tell the
    two apart, and dojis and auctions produce such bars for real.
    """
    return "low" if entry["lows"] is not None else "high"


def _last_start(raw: list[dict], *, after: int, upto: int) -> int | None:
    """The index of the last leg start in `[after, upto)`, or None if the range holds none.

    A mark at bar `s` says a leg turned there, so it belongs to the first vertex *strictly
    after* `s` — the one that closes that leg. Hence the half-open range: it takes the previous
    vertex, whose bar can itself be where the leg turned, and leaves out this one, whose own
    mark belongs to the leg still running past it.

    Bounding the search by the previous vertex is what keeps one leg start from being claimed
    by several vertices. A vertex whose range holds no start gets `None` — an honest hole,
    rather than a stale Candle presented as this leg's origin.

    `max(after, 0)` guards the first vertex, which is called with `after=-1`: a bare
    `range(-1, upto)` would visit `-1` and read the *last* bar of the series.
    """
    for index in reversed(range(max(after, 0), upto)):
        if raw[index]["start"] is not None:
            return index
    return None