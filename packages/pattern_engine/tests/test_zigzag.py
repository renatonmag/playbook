"""Tests for the zigzag adapter, not for the zigzag algorithm.

The algorithm has known defects and is due a rewrite, so nothing here pins which bars it picks
— that would freeze the bugs into the suite. What is asserted is what the adapter promises:
the output is sparse, ordered, alternating, anchored on real bars, and honest about `since`.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot, _last_start, _side
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def wave(count: int = 60, span: float = 8.0, period: int = 12) -> BaseSeries[Candle]:
    """Candles tracing a clean triangular wave, so tops and bottoms are unambiguous."""
    bars = []
    for i in range(count):
        phase = i % period
        rising = phase < period // 2
        offset = phase if rising else period - phase
        mid = 100.0 + span * offset / (period // 2)
        bars.append(
            Candle(
                time=OPEN + timedelta(minutes=5 * i),
                open=mid,
                high=mid + 0.5,
                low=mid - 0.5,
                close=mid,
                volume=100.0,
            )
        )
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


def run(bars: BaseSeries[Candle], depth: int = 5) -> BaseSeries[ZigZagPivot]:
    pattern = ZigZagPattern(depth=depth, reads=("5m",), emits="5m")
    return pattern.run({BARS: {"5m": bars}, INSTRUMENT: "WIN@N"})


def test_producer_names_the_class_and_its_parameters():
    pattern = ZigZagPattern(depth=5, reads=("5m",), emits="5m")
    assert pattern.producer == "zig-zag(depth=5,reads=5m,emits=5m)"


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run(wave())
    assert series.identity.producer == "zig-zag(depth=5,reads=5m,emits=5m)"
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"


def test_output_is_sparse():
    bars = wave()
    series = run(bars)
    assert 0 < len(series) < len(bars)


def test_vertices_alternate_between_top_and_bottom():
    directions = [pivot.direction for pivot in run(wave())]
    assert len(directions) > 2
    assert all(a != b for a, b in zip(directions, directions[1:]))


def test_each_vertex_sits_on_a_real_bar_at_that_bar_s_extreme():
    bars = wave()
    by_time = {bar.time: bar for bar in bars}
    for pivot in run(bars):
        bar = by_time[pivot.time]
        assert pivot.price == (bar.high if pivot.direction == "high" else bar.low)


def test_points_are_ordered_by_time():
    # `BaseSeries` raises on unordered Points, so construction succeeding is half the assertion.
    times = [pivot.time for pivot in run(wave())]
    assert times == sorted(times)


def test_since_is_a_candle_of_the_window_or_none():
    bars = wave()
    known = {bar.time for bar in bars}
    for pivot in run(bars):
        assert pivot.since is None or pivot.since.time in known


def test_a_window_shorter_than_depth_yields_an_empty_series():
    series = run(wave(count=3), depth=5)
    assert not series


def test_missing_timeframe_raises_rather_than_returning_empty():
    # `ctx[key]`, never `ctx.get(key, empty)` — "not produced" must not read as "found nothing".
    pattern = ZigZagPattern(depth=5, reads=("1h",), emits="1h")
    with pytest.raises(KeyError):
        pattern.run({BARS: {"5m": wave()}, INSTRUMENT: "WIN@N"})


class TestSide:
    """Which extreme a vertex is, when the arrays agree and when they do not."""

    def test_a_bar_marked_only_as_a_high_is_a_high(self):
        assert _side({"highs": 10.0, "lows": None}) == "high"

    def test_a_bar_marked_only_as_a_low_is_a_low(self):
        assert _side({"highs": None, "lows": 9.0}) == "low"

    def test_a_bar_marked_as_both_is_a_low(self):
        """`_cleanup_lows` runs after `_cleanup_highs`, so the low is what `zz` ends up holding.

        Real B3 bars produce this; a triangular wave never does, which is why it took live data
        to surface. Reading `highs` first labelled the vertex `high` while pricing it at the
        bar's low, and broke the top/bottom alternation.
        """
        assert _side({"highs": 10.0, "lows": 9.0}) == "low"


class TestLastStart:
    """The pairing rule: a leg start belongs to the first vertex that closes over it."""

    @staticmethod
    def raw(*starts: int) -> list[dict]:
        return [{"start": 1.0 if i in starts else None} for i in range(10)]

    def test_finds_the_last_start_inside_the_range(self):
        assert _last_start(self.raw(2, 4), after=1, upto=6) == 4

    def test_the_range_includes_the_previous_vertex_and_excludes_this_one(self):
        """A mark belongs to the first vertex *after* it — the one closing the leg it began.

        So the previous vertex's own bar is in range: a leg can turn on the very bar that ends
        the one before it. This vertex's bar is not: a mark there belongs to the leg running
        past it, and claiming it here would put `since` on the vertex itself.
        """
        assert _last_start(self.raw(3), after=3, upto=6) == 3
        assert _last_start(self.raw(6), after=3, upto=6) is None

    def test_the_first_vertex_does_not_wrap_around_the_series(self):
        """`run` opens with `after=-1`, and a bare `range(-1, upto)` would read the last bar."""
        raw = [{"start": None}] * 9 + [{"start": 1.0}]
        assert _last_start(raw, after=-1, upto=3) is None

    def test_a_range_holding_no_start_gives_none(self):
        assert _last_start(self.raw(9), after=1, upto=6) is None

    def test_one_start_cannot_be_claimed_by_two_vertices(self):
        raw = self.raw(2)
        assert _last_start(raw, after=-1, upto=3) == 2
        assert _last_start(raw, after=3, upto=7) is None
