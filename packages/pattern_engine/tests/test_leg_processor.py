"""Tests for the leg slicer and its adapter.

Two layers, tested apart. `split_legs` is handed Pivots built by hand, because what is asserted
there is the slicing rule alone — where a detector *puts* its vertices is that detector's own
test's business. `LegPattern` is then checked for what an adapter promises: the identity of the
run, Points anchored on real bars, and the same behaviour whichever detector feeds it.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, Pivot, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_processor import Leg, LegPattern, split_legs
from pattern_engine.patterns.simple_leg import SimpleLegPattern
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


def run(bars: BaseSeries[Candle], source) -> BaseSeries[Leg]:
    """Run `source` and then the slicer over its output, the way a pipeline would."""
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    return LegPattern(source=source, reads=("5m",), emits="5m").run(ctx)


# --- the slicing rule -------------------------------------------------------------------


def test_a_leg_runs_from_one_pivot_to_the_next_inclusive():
    # Pivots on the first and last bar, so no head or tail is folded in to obscure the span.
    bars = wave(count=19)
    legs = split_legs(bars.points, pivots_at(bars, 0, 6, 12, 18))
    assert len(legs) == 3
    assert [len(leg) for leg in legs] == [7, 7, 7]


def test_consecutive_legs_share_the_boundary_bar():
    """The bar a leg ends on is the bar the next one starts from — the same object, not a copy."""
    bars = wave()
    legs = split_legs(bars.points, pivots_at(bars, 5, 11, 17, 23))
    assert all(a[-1] is b[0] for a, b in zip(legs, legs[1:]))


def test_the_head_joins_the_first_leg_and_the_tail_joins_the_last():
    bars = wave()
    legs = split_legs(bars.points, pivots_at(bars, 4, 10, 16))
    assert legs[0][0] is bars[0]
    assert legs[0][4] is bars[4]  # the first pivot, no longer the leg's first bar
    assert legs[-1][-1] is bars[len(bars) - 1]


def test_no_bar_of_the_window_is_dropped():
    bars = wave()
    legs = split_legs(bars.points, pivots_at(bars, 4, 10, 16, 40))
    assert {bar.time for leg in legs for bar in leg} == {bar.time for bar in bars}


def test_boundary_bars_are_the_only_thing_counted_twice():
    """`sum(len(leg))` overshoots by exactly one per shared boundary, and by nothing else."""
    bars = wave()
    legs = split_legs(bars.points, pivots_at(bars, 4, 10, 16, 40))
    assert sum(len(leg) for leg in legs) == len(bars) + len(legs) - 1


def test_no_pivots_yields_no_legs():
    """Not one leg spanning everything: with no vertex, nothing measured where a leg turned."""
    assert split_legs(wave().points, []) == []


def test_a_single_pivot_yields_the_whole_window_as_one_leg():
    bars = wave()
    legs = split_legs(bars.points, pivots_at(bars, 20))
    assert len(legs) == 1
    assert legs[0] == list(bars.points)


def test_an_empty_window_yields_no_legs():
    assert split_legs([], []) == []


def test_a_pivot_on_no_bar_of_the_window_raises():
    """A skipped vertex would leave a leg running straight through it — plausible and wrong."""
    bars = wave()
    orphan = Pivot.anchored(
        Candle(time=OPEN - timedelta(minutes=5), open=1.0, high=1.0, low=1.0, close=1.0,
               volume=1.0),
        price=1.0,
    )
    with pytest.raises(ValueError, match="different Timeframes"):
        split_legs(bars.points, [*pivots_at(bars, 4, 10), orphan])


# --- the adapter ------------------------------------------------------------------------


def test_producer_embeds_the_producer_of_its_source():
    source = SimpleLegPattern(reads=("5m",), emits="5m")
    pattern = LegPattern(source=source, reads=("5m",), emits="5m")
    assert pattern.producer == (
        "leg(source=<simple-leg(reads=5m,emits=5m)>,reads=5m,emits=5m)"
    )


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run(wave(), SimpleLegPattern(reads=("5m",), emits="5m"))
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"
    assert series.identity.producer.startswith("leg(source=<simple-leg(")


def test_points_are_ordered_by_time():
    # `BaseSeries` raises on unordered Points, so construction succeeding is half the assertion.
    times = [leg.time for leg in run(wave(), SimpleLegPattern(reads=("5m",), emits="5m"))]
    assert times == sorted(times)


def test_each_leg_is_anchored_on_its_own_first_bar():
    """The anchor carries that bar's OHLCV, which says nothing about the leg — `bars` does."""
    for leg in run(wave(), SimpleLegPattern(reads=("5m",), emits="5m")):
        first = leg.bars[0]
        assert leg.time == first.time
        assert (leg.open, leg.high, leg.low, leg.close, leg.volume) == (
            first.open, first.high, first.low, first.close, first.volume
        )


@pytest.mark.parametrize(
    "source",
    [
        SimpleLegPattern(reads=("5m",), emits="5m"),
        ZigZagPattern(depth=5, reads=("5m",), emits="5m"),
    ],
    ids=["simple-leg", "zig-zag"],
)
def test_either_detector_feeds_it_and_the_invariants_hold(source):
    """Nothing here reads anything but `time`, so the two Pivot types are interchangeable."""
    bars = wave()
    legs = [leg.bars for leg in run(bars, source)]
    assert legs
    assert all(a[-1] is b[0] for a, b in zip(legs, legs[1:]))
    assert {bar.time for leg in legs for bar in leg} == {bar.time for bar in bars}


def test_a_source_absent_from_ctx_raises_rather_than_returning_empty():
    # `ctx[key]`, never `ctx.get(key, empty)` — "not produced" must not read as "found nothing".
    source = SimpleLegPattern(reads=("5m",), emits="5m")
    pattern = LegPattern(source=source, reads=("5m",), emits="5m")
    with pytest.raises(KeyError):
        pattern.run({BARS: {"5m": wave()}, INSTRUMENT: "WIN@N"})


def test_an_empty_window_yields_an_empty_series():
    empty = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), [])
    assert not run(empty, SimpleLegPattern(reads=("5m",), emits="5m"))
