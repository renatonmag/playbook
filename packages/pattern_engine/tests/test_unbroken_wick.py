"""Tests for `unbroken-wick` — the rule first, then the side it is asked on, then the adapter.

The rule tests speak in hand-built Candles whose closes are chosen to break or spare one wick at a
time; the side tests in hand-built `LegMark`s, because which bar a detector turns on is exactly what
cannot be asked of it. One test at the bottom drives the real `simple-leg` chain.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.unbroken_wick import (
    UnbrokenWick,
    UnbrokenWickPattern,
    running_side,
    unbroken_wick,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

Side = Literal["high", "low"]


def bar(index: int, high: float, low: float, close: float) -> Candle:
    return Candle(
        time=OPEN + timedelta(minutes=5 * index),
        open=close,
        high=high,
        low=low,
        close=close,
        volume=100.0,
    )


def mark(index: int, side: Side, provisional: bool = False) -> LegMark:
    candle = bar(index, 101.0, 99.0, 100.0)
    price = candle.high if side == "high" else candle.low
    return LegMark.anchored(candle, price=price, direction=side, provisional=provisional)


def times(found: list[UnbrokenWick]) -> list[datetime]:
    return [point.time for point in found]


# --- the rule ---------------------------------------------------------------------------


def test_a_high_closed_above_is_skipped_for_the_next_one_standing():
    bars = [
        bar(0, 105.0, 99.0, 100.0),  # broken by bar 1's close
        bar(1, 110.0, 104.0, 106.0),  # never closed above
        bar(2, 108.0, 103.0, 104.0),
    ]
    found = unbroken_wick(bars, "high", 10)
    assert times(found) == [bars[1].time]
    assert found[0].price == 110.0
    assert found[0].direction == "high"


def test_a_wick_through_the_high_without_a_close_does_not_break_it():
    bars = [bar(0, 105.0, 99.0, 100.0), bar(1, 107.0, 100.0, 104.0)]
    assert times(unbroken_wick(bars, "high", 10)) == [bars[0].time]


def test_a_close_exactly_at_the_high_does_not_break_it():
    bars = [bar(0, 105.0, 99.0, 100.0), bar(1, 106.0, 100.0, 105.0)]
    assert times(unbroken_wick(bars, "high", 10)) == [bars[0].time]


def test_a_bear_leg_asks_the_lows_and_a_close_below_breaks_one():
    bars = [
        bar(0, 101.0, 95.0, 100.0),  # broken by bar 1's close
        bar(1, 96.0, 90.0, 94.0),  # never closed below
        bar(2, 97.0, 92.0, 93.0),
    ]
    found = unbroken_wick(bars, "low", 10)
    assert times(found) == [bars[1].time]
    assert found[0].price == 90.0


def test_only_the_last_lookback_bars_are_candidates():
    """Bar 0 would survive, but it is outside the window of three."""
    bars = [
        bar(0, 200.0, 99.0, 100.0),
        bar(1, 105.0, 99.0, 100.0),
        bar(2, 107.0, 100.0, 106.0),
        bar(3, 108.0, 101.0, 107.0),
    ]
    assert times(unbroken_wick(bars, "high", 3)) == [bars[2].time]


def test_a_straight_run_leaves_only_the_newest_bar():
    bars = [bar(i, 100.0 + i + 0.5, 100.0 + i - 0.5, 100.0 + i + 0.4 + 1.0) for i in range(5)]
    assert times(unbroken_wick(bars, "high", 10)) == [bars[-1].time]


def test_no_side_or_no_bars_is_nothing():
    assert unbroken_wick([bar(0, 101.0, 99.0, 100.0)], None, 10) == []
    assert unbroken_wick([], "high", 10) == []


# --- which side is asked ----------------------------------------------------------------


def test_a_provisional_mark_gives_its_own_side():
    assert running_side([mark(0, "low"), mark(4, "high", provisional=True)]) == "high"


def test_a_settled_last_mark_gives_the_other_side():
    """The leg it closed is over; the one opening on its bar runs the other way."""
    assert running_side([mark(0, "low"), mark(4, "high")]) == "low"


def test_no_marks_is_no_side():
    assert running_side([]) is None


# --- the adapter ------------------------------------------------------------------------


def test_the_adapter_reads_simple_leg_and_names_the_run():
    bars = BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"),
        [bar(i, 100.0 + 2 * i + 0.5, 100.0 + 2 * i - 0.5, 100.0 + 2 * i) for i in range(12)],
    )
    legs = SimpleLegPattern(reads=("5m",), emits="5m")
    wick = UnbrokenWickPattern(source=legs, lookback=10, reads=("5m",), emits="5m")
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[legs.producer] = legs.run(ctx)

    series = wick.run(ctx)

    assert wick.producer.startswith("unbroken-wick(")
    assert series.identity.producer == wick.producer
    # A steady climb: a bull leg is running, and every close clears the high before it, so the only
    # wick left standing is the newest bar's.
    assert [p.direction for p in series.points] == ["high"]
    assert series.points[0].time == bars.points[-1].time
