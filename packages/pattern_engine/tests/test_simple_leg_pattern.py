"""Tests for the `simple-leg` adapter, not for the marker underneath it.

Which bars `PbMark` picks is `test_simple_leg.py`'s business. What is asserted here is what the
adapter promises: the output is sparse, ordered, anchored on real bars, priced at the side the
mark names, carrying the identity of the run it came from, and closing on the leg still running.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
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


def flat(count: int = 20) -> BaseSeries[Candle]:
    """Bars that never move: no direction can be seeded, so nothing is marked."""
    bars = [
        Candle(time=OPEN + timedelta(minutes=5 * i), open=100.0, high=100.5, low=99.5,
               close=100.0, volume=100.0)
        for i in range(count)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


def run(bars: BaseSeries[Candle]) -> BaseSeries[LegMark]:
    pattern = SimpleLegPattern(reads=("5m",), emits="5m")
    return pattern.run({BARS: {"5m": bars}, INSTRUMENT: "WIN@N"})


def test_producer_names_the_class_and_its_parameters():
    # No parameters of its own — `PbMark` has none to pass through.
    assert SimpleLegPattern(reads=("5m",), emits="5m").producer == "simple-leg(reads=5m,emits=5m)"


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run(wave())
    assert series.identity.producer == "simple-leg(reads=5m,emits=5m)"
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"


def test_output_is_sparse():
    bars = wave()
    series = run(bars)
    assert 0 < len(series) < len(bars)


def test_each_point_sits_on_a_real_bar_at_the_extreme_its_side_names():
    """`price` is the marked bar's own extreme — never the leg's, when the two differ."""
    bars = wave()
    by_time = {bar.time: bar for bar in bars}
    for mark in run(bars):
        bar = by_time[mark.time]
        assert mark.price == (bar.high if mark.direction == "high" else bar.low)


def test_every_point_carries_a_side():
    assert all(mark.direction in ("high", "low") for mark in run(wave()))


def test_points_are_ordered_by_time():
    # `BaseSeries` raises on unordered Points, so construction succeeding is half the assertion.
    times = [mark.time for mark in run(wave())]
    assert times == sorted(times)


def test_a_point_carries_the_ohlcv_of_the_bar_it_is_anchored_on():
    """A Point *is* a Candle plus a payload — the screen compares the two to judge placement."""
    bars = wave()
    by_time = {bar.time: bar for bar in bars}
    for mark in run(bars):
        bar = by_time[mark.time]
        assert (mark.open, mark.high, mark.low, mark.close, mark.volume) == (
            bar.open, bar.high, bar.low, bar.close, bar.volume
        )


def test_the_last_point_is_the_leg_still_running_and_says_so():
    """A mark lands only when the *next* leg turns, so without this the line stops short."""
    bars = wave()
    marks = list(run(bars))
    assert marks[-1].provisional
    assert marks[-1].time == bars.points[-1].time
    assert not any(mark.provisional for mark in marks[:-1])


def test_the_provisional_point_is_priced_on_the_newest_bar_like_every_other():
    """No second pricing rule for it — the marked bar's extreme, on the running leg's side."""
    bars = wave()
    last = bars.points[-1]
    running = list(run(bars))[-1]
    assert running.price == (last.high if running.direction == "high" else last.low)


def test_a_series_with_no_readable_direction_yields_an_empty_series():
    # And no provisional Point either: with nothing seeded there is no running leg to report.
    assert not run(flat())


def test_an_empty_window_yields_an_empty_series():
    assert not run(BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), []))


def test_missing_timeframe_raises_rather_than_returning_empty():
    # `ctx[key]`, never `ctx.get(key, empty)` — "not produced" must not read as "found nothing".
    pattern = SimpleLegPattern(reads=("1h",), emits="1h")
    with pytest.raises(KeyError):
        pattern.run({BARS: {"5m": wave()}, INSTRUMENT: "WIN@N"})


def test_on_an_unambiguous_wave_the_marks_alternate_and_land_on_the_true_extremes():
    """The density the rule shows on real bars comes from noise, not from the rule itself.

    Given bars that turn cleanly, it marks each turn once and nothing in between — so the two
    complaints the monitor is meant to surface (a dense line, and vertices short of the real
    extreme) are both about how the rule meets real data, and neither is visible here.
    """
    # Settled marks only: the last Point is the leg still running, anchored mid-slope on the
    # newest bar, so it neither alternates with its predecessor nor sits on a true extreme.
    # Needing this filter is the whole reason the flag exists.
    marks = [mark for mark in run(wave()) if not mark.provisional]
    sides = [mark.direction for mark in marks]
    assert len(sides) > 2
    assert all(a != b for a, b in zip(sides, sides[1:]))

    tops = {mark.price for mark in marks if mark.direction == "high"}
    bottoms = {mark.price for mark in marks if mark.direction == "low"}
    assert tops == {max(bar.high for bar in wave())}
    assert bottoms == {min(bar.low for bar in wave())}
