"""Tests for `pivot-offset` — the rule first, then the adapter over it.

The rule tests speak in hand-built `LegMark`/`ZigZagPivot` lists: which bar a detector turns on is
exactly what cannot be asked of it. The adapter tests assert what the Pattern promises on top —
that the Point sits on the mark's bar carrying its bar whole, and that the identity names the run.
One test at the bottom drives the real two-detector chain over synthetic Candles.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.pivot_offset import (
    PivotOffset,
    PivotOffsetPattern,
    pivot_offset,
)
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

Side = Literal["high", "low"]


def bar(index: int, price: float) -> Candle:
    return Candle(
        time=OPEN + timedelta(minutes=5 * index),
        open=price,
        high=price + 0.5,
        low=price - 0.5,
        close=price,
        volume=100.0,
    )


def mark(index: int, side: Side, price: float, provisional: bool = False) -> LegMark:
    return LegMark.anchored(bar(index, price), price=price, direction=side, provisional=provisional)


def pivot(index: int, side: Side, price: float) -> ZigZagPivot:
    return ZigZagPivot.anchored(bar(index, price), price=price, direction=side, since=None)


# --- which way the pair sits ------------------------------------------------------------


def test_a_mark_past_the_newest_vertex_is_offset():
    found = pivot_offset([mark(4, "high", 110.0)], [pivot(2, "high", 108.0)])
    assert [p.offset for p in found] == [True]


def test_a_mark_before_the_newest_vertex_is_not_offset():
    found = pivot_offset([mark(2, "high", 108.0)], [pivot(4, "high", 110.0)])
    assert [p.offset for p in found] == [False]


def test_the_same_bar_is_not_offset():
    """Agreement on the bar is the `False` case, not a third one — `>` and never `>=`."""
    found = pivot_offset([mark(3, "high", 109.0)], [pivot(3, "high", 109.0)])
    assert [p.offset for p in found] == [False]


def test_only_the_newest_of_each_is_compared():
    """Older pairs are not reported, however they sat. One Point, the right edge only."""
    found = pivot_offset(
        [mark(0, "high", 110.0), mark(2, "low", 100.0), mark(6, "high", 112.0)],
        [pivot(1, "high", 110.0), pivot(4, "low", 99.0)],
    )
    assert len(found) == 1
    assert found[0].time == bar(6, 112.0).time
    assert found[0].offset is True


def test_the_sides_need_not_match():
    """A high marked after a low vertex is still the simple legs running ahead."""
    found = pivot_offset([mark(5, "high", 110.0)], [pivot(3, "low", 98.0)])
    assert [p.offset for p in found] == [True]


# --- the provisional mark ---------------------------------------------------------------


def test_a_provisional_newest_mark_falls_back_to_the_confirmed_one_behind_it():
    found = pivot_offset(
        [mark(1, "high", 108.0), mark(9, "low", 96.0, provisional=True)],
        [pivot(4, "high", 110.0)],
    )
    assert len(found) == 1
    assert found[0].time == bar(1, 108.0).time
    assert found[0].offset is False


def test_nothing_but_provisional_marks_says_nothing():
    assert pivot_offset([mark(9, "low", 96.0, provisional=True)], [pivot(4, "high", 110.0)]) == []


# --- nothing to compare -----------------------------------------------------------------


def test_no_marks_says_nothing():
    assert pivot_offset([], [pivot(4, "high", 110.0)]) == []


def test_no_pivots_says_nothing():
    """Not `False`. A window the zigzag said nothing in has not shown the two agreeing."""
    assert pivot_offset([mark(4, "high", 110.0)], []) == []


def test_neither_says_nothing():
    assert pivot_offset([], []) == []


# --- the adapter ------------------------------------------------------------------------


def sources() -> tuple[SimpleLegPattern, ZigZagPattern]:
    return (
        SimpleLegPattern(reads=("5m",), emits="5m"),
        ZigZagPattern(depth=8, reads=("5m",), emits="5m"),
    )


def run(marks: list[LegMark], pivots: list[ZigZagPivot]) -> BaseSeries[PivotOffset]:
    simple, zigzag = sources()
    pattern = PivotOffsetPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")
    return pattern.run(
        {
            INSTRUMENT: "WIN@N",
            simple.producer: BaseSeries(
                SeriesIdentity(simple.producer, "WIN@N", "5m"), marks
            ),
            zigzag.producer: BaseSeries(
                SeriesIdentity(zigzag.producer, "WIN@N", "5m"), pivots
            ),
        }
    )


def test_producer_embeds_the_producers_of_both_sources():
    simple, zigzag = sources()
    pattern = PivotOffsetPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")
    assert pattern.producer == (
        "pivot-offset(source=<simple-leg(reads=5m,emits=5m)>,"
        "pivots=<zig-zag(depth=8,reads=5m,emits=5m)>,reads=5m,emits=5m)"
    )


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run([mark(4, "high", 110.0)], [pivot(2, "high", 108.0)])
    assert series.identity.producer.startswith("pivot-offset(")
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"


def test_the_point_carries_the_mark_s_bar_whole():
    deciding = mark(4, "high", 110.0)
    series = run([deciding], [pivot(2, "high", 108.0)])
    assert len(series) == 1
    point = series[0]
    assert (point.time, point.open, point.high, point.low, point.close, point.volume) == (
        deciding.time, deciding.open, deciding.high, deciding.low, deciding.close, deciding.volume
    )


def test_an_empty_reading_is_a_series_and_not_an_absent_key():
    series = run([], [])
    assert len(series) == 0
    assert series.identity.instrument == "WIN@N"


def test_the_real_chain_over_candles_reads_one_point_at_most():
    """Both detectors run for real, so the pair is whatever they actually found.

    Only the structure is asserted — never a bar index — because which bar each detector turns on
    is the thing under test everywhere else and an accident here.
    """
    prices = [100.0 + (i % 7) * 2 - (i % 11) for i in range(80)]
    window = BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"),
        [bar(index, price) for index, price in enumerate(prices)],
    )

    simple, zigzag = sources()
    pattern = PivotOffsetPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")

    ctx = {BARS: {"5m": window}, INSTRUMENT: "WIN@N"}
    for upstream in (zigzag, simple):
        ctx[upstream.producer] = upstream.run(ctx)
    series = pattern.run(ctx)

    assert len(series) <= 1
    for point in series:
        assert isinstance(point.offset, bool)
        # The confirmed mark it sat on is a real mark of the source Series, never the provisional.
        marks = {m.time: m for m in ctx[simple.producer]}
        assert marks[point.time].provisional is False
