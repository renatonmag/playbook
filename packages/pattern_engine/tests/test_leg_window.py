"""Tests for the extended leg slicer and its adapter.

Two layers, tested apart, the same way `test_leg_processor.py` does it. `split_leg_windows` is
handed Pivots built by hand, because what is asserted is the slicing rule alone. `LegWindowPattern`
is then checked for what an adapter promises: the identity of the run, Points anchored on real
bars, and a detector's vertices reaching it intact.

Almost every assertion here is about `since` and `end`, because they are inclusive indices and an
off-by-one in either one is invisible on a chart.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, Pivot, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_window import LegWindow, LegWindowPattern, split_leg_windows
from pattern_engine.patterns.zigzag import ZigZagPattern
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


def pivots_at(bars: BaseSeries[Candle], *indices: int) -> list[Pivot]:
    """Vertices placed by hand, so the slicing rule is tested without a detector in the way."""
    return [Pivot.anchored(bars[i], price=bars[i].close) for i in indices]


def run(bars: BaseSeries[Candle], source, ahead: int = 5) -> BaseSeries[LegWindow]:
    """Run `source` and then the slicer over its output, the way a pipeline would."""
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    return LegWindowPattern(source=source, ahead=ahead, reads=("5m",), emits="5m").run(ctx)


# --- the slicing rule -------------------------------------------------------------------


def test_a_middle_leg_carries_exactly_ahead_bars_past_its_close():
    bars = wave()
    # Three legs, so the middle one is neither the head-folded first nor the remainder-swallowing
    # last — the only place the plain `ahead` rule applies.
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20, 30), ahead=5)
    middle = windows[1]

    assert middle.bars[middle.end + 1 :] == tuple(bars.points[21:26])
    assert len(middle.bars[middle.end + 1 :]) == 5


def test_the_leg_itself_is_the_slice_between_the_two_pivots_inclusive():
    bars = wave()
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20, 30), ahead=5)
    middle = windows[1]

    assert middle.bars[middle.since : middle.end + 1] == tuple(bars.points[10:21])
    assert middle.bars[middle.since] is bars[10]
    assert middle.bars[middle.end] is bars[20]


def test_the_first_leg_keeps_the_window_head_and_since_says_where_it_ends():
    bars = wave()
    # First Pivot at bar 4, so four bars of head are folded in ahead of it.
    windows = split_leg_windows(bars.points, pivots_at(bars, 4, 14, 24), ahead=5)
    first = windows[0]

    assert first.since == 4
    assert first.bars[: first.since] == tuple(bars.points[:4])
    assert first.bars[first.since] is bars[4]
    assert first.time == bars[0].time


def test_since_is_zero_on_every_leg_but_the_first():
    bars = wave()
    windows = split_leg_windows(bars.points, pivots_at(bars, 4, 14, 24, 34), ahead=5)

    assert [window.since for window in windows] == [4, 0, 0]


def test_the_last_leg_swallows_the_whole_remainder_not_just_ahead():
    bars = wave(count=60)
    # 39 bars sit past the final Pivot — far more than `ahead`, and all of them are kept.
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20), ahead=5)
    last = windows[-1]

    assert last.bars[last.end + 1 :] == tuple(bars.points[21:])
    assert len(last.bars[last.end + 1 :]) == 39


def test_a_tail_comes_up_short_when_the_window_ends_inside_it():
    bars = wave(count=24)
    # The second-to-last leg closes at 20 with only three bars left in the window — the one place
    # a tail can be shorter than `ahead` without being the last leg's unbounded one.
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20, 22), ahead=5)
    penultimate = windows[1]

    assert penultimate.bars[penultimate.end + 1 :] == tuple(bars.points[21:24])
    assert len(penultimate.bars[penultimate.end + 1 :]) == 3


def test_consecutive_legs_overlap_by_ahead_plus_one_bars():
    bars = wave()
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20, 30), ahead=5)

    shared = set(bar.time for bar in windows[0].bars) & set(bar.time for bar in windows[1].bars)
    assert len(shared) == 6
    # The tail of one leg is literally the opening bars of the next, closing Pivot included.
    assert windows[0].bars[windows[0].end :] == windows[1].bars[:6]


def test_ahead_of_zero_leaves_the_close_as_the_last_bar():
    bars = wave()
    windows = split_leg_windows(bars.points, pivots_at(bars, 0, 10, 20, 30), ahead=0)
    middle = windows[1]

    assert middle.end == len(middle.bars) - 1
    assert middle.bars[middle.end + 1 :] == ()


def test_one_pivot_is_not_a_leg_and_yields_nothing():
    # Deliberately unlike `split_legs`, which answers a single Pivot with the whole window: a
    # `LegWindow` cannot name a start and an end that are not there.
    bars = wave()

    assert split_leg_windows(bars.points, pivots_at(bars, 10), ahead=5) == []


def test_no_pivots_yields_nothing():
    bars = wave()

    assert split_leg_windows(bars.points, [], ahead=5) == []


def test_a_pivot_on_no_bar_of_the_window_raises():
    bars = wave()
    stray = Pivot(
        time=OPEN - timedelta(minutes=5), open=1.0, high=1.0, low=1.0, close=1.0, volume=0.0,
        price=1.0,
    )

    with pytest.raises(ValueError, match="sits on no bar"):
        split_leg_windows(bars.points, [*pivots_at(bars, 0), stray], ahead=5)


# --- the adapter ------------------------------------------------------------------------


def test_the_producer_key_states_the_source_and_the_tail_length():
    source = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    pattern = LegWindowPattern(source=source, ahead=5, reads=("5m",), emits="5m")

    assert pattern.producer == (
        "leg-window(source=<zig-zag(depth=8,reads=5m,emits=5m)>,ahead=5,reads=5m,emits=5m)"
    )


def test_the_series_carries_the_identity_of_the_run():
    source = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    series = run(wave(), source)

    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"
    assert series.identity.producer.startswith("leg-window(")


def test_every_point_is_anchored_on_its_own_first_bar():
    for window in run(wave(), ZigZagPattern(depth=8, reads=("5m",), emits="5m")):
        assert window.time == window.bars[0].time
        assert window.close == window.bars[0].close


def test_an_empty_window_produces_an_empty_series():
    empty = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), [])

    assert not run(empty, ZigZagPattern(depth=8, reads=("5m",), emits="5m"))
