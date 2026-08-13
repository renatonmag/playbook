"""The zigzag — a chart's alternating run of tops and bottoms.

Two things live here. `ZigZagIndidicator` is the algorithm, kept exactly as it was written:
it speaks in dicts of `high`/`low` and answers with dense lists parallel to the input, mostly
`None`. `ZigZagPattern` is the adapter that makes it a Pattern — it translates in both
directions and packs the surviving vertices into a Series.

The split is deliberate. The algorithm has known defects (see the module's tests and the
`since` note on `ZigZagPattern.run`), and wrapping it rather than rewriting it means the
interface can change without the semantics moving underneath.
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

        # Adjusted loop to include the last candle
        for idx in range(self._depth, self._size + 1):
            if idx < self._size:
                window = self._data[
                    idx - self._depth : idx
                ]
                current_max = max(
                    candle["high"] for candle in window
                )
                current_min = min(
                    candle["low"] for candle in window
                )

                self._update_highs_lows(
                    idx,
                    current_max,
                    current_min,
                    last_high,
                    last_low,
                )

                if last_high != current_max:
                    last_high = current_max
                    last_high_idx = idx - 1
                if last_low != current_min:
                    last_low = current_min
                    last_low_idx = idx - 1

                leg_up, leg_down = self._update_legs(
                    idx,
                    last_high_idx,
                    last_low_idx,
                    leg_up,
                    leg_down,
                )
            else:
                # Handle the last candle by considering the final window
                window = self._data[
                    idx - self._depth : idx
                ]
                current_max = max(
                    candle["high"] for candle in window
                )
                current_min = min(
                    candle["low"] for candle in window
                )

                self._update_highs_lows(
                    idx,
                    current_max,
                    current_min,
                    last_high,
                    last_low,
                )

                # Update legs if necessary
                if last_high != current_max:
                    last_high = current_max
                    last_high_idx = idx - 1
                if last_low != current_min:
                    last_low = current_min
                    last_low_idx = idx - 1

                leg_up, leg_down = self._update_legs(
                    idx,
                    last_high_idx,
                    last_low_idx,
                    leg_up,
                    leg_down,
                )

        self._cleanup_extremes()

    def _update_highs_lows(
        self,
        idx,
        current_max,
        current_min,
        last_high,
        last_low,
    ):
        if idx < self._size:
            previous_candle = self._data[idx - 1]
            if (
                current_max == previous_candle["high"]
                and last_high != current_max
            ):
                self.highs[idx - 1] = current_max
            if (
                current_min == previous_candle["low"]
                and last_low != current_min
            ):
                self.lows[idx - 1] = current_min
        else:
            # For the extended index, check the last candle
            previous_candle = self._data[-1]
            if (
                current_max == previous_candle["high"]
                and last_high != current_max
            ):
                self.highs[-1] = current_max
            if (
                current_min == previous_candle["low"]
                and last_low != current_min
            ):
                self.lows[-1] = current_min

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
        refined_data = self._refine_start_points(
            finalized_data
        )
        return refined_data

    def _refine_start_points(self, data):
        zz_valid = [
            i
            for i, entry in enumerate(data)
            if entry["zz"] is not None
        ]
        for idx in range(len(zz_valid) - 1):
            current_idx = zz_valid[idx]
            next_idx = zz_valid[idx + 1]
            for j in range(current_idx + 1, next_idx):
                if data[j]["start"] is not None:
                    data[j]["start"] = None
        return data

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

    def __init__(self, *, depth: int, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)
        self.depth = depth

    def run(self, ctx: Ctx) -> BaseSeries[ZigZagPivot]:
        """Run the indicator over `emits`' Candles and pack the vertices it kept.

        Which side of the bar a vertex is on is read from `highs`/`lows` being populated, not
        from comparing `zz` against them — the comparison is ambiguous on any bar where
        `high == low`, which a doji or an auction produces for real. See `_side` for the case
        where a bar is marked on both.

        **`since` is under-populated today**, and that is the algorithm's doing, not this
        wrapper's: `_update_legs` writes `self.lows[i]` into `start[i]` while that entry is
        often still `None`, so most leg turns record nothing. Expect most Points to carry
        `since=None` until that is fixed.
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
    """The index of the last leg start in `(after, upto]`, or None if the range holds none.

    Bounding the search by the previous vertex is what keeps one leg start from being claimed
    by several vertices. A vertex whose range holds no start gets `None` — an honest hole,
    rather than a stale Candle presented as this leg's origin.
    """
    for index in reversed(range(after + 1, upto + 1)):
        if raw[index]["start"] is not None:
            return index
    return None