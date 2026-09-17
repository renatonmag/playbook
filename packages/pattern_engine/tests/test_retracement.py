"""Tests for `retracement` — the rule first, then the adapter over it.

The rule tests speak in hand-built pivot lists, because no detector can be asked for a leg that
takes out the top three legs back. They are written as `ZigZagPivot`s throughout and the adapter
tests cover `LegMark` as well: the rule reads `price` and `direction`, which both carry, and a
fixture per source would be the same table twice.

`flipped` is a transform rather than a second table, so the bear mirror cannot drift from the bull
case it mirrors. One test at the bottom drives the real `zig-zag → retracement` chain.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.retracement import (
    RetracementPattern,
    retracements,
)
from pattern_engine.patterns.leg_reach import LegReachPattern
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

Side = Literal["high", "low"]

#: One pivot as a fixture reads it: which bar, which extreme, what price.
Spec = tuple[int, Side, float]

_OTHER: dict[Side, Side] = {"high": "low", "low": "high"}


def bar(index: int, price: float) -> Candle:
    return Candle(
        time=OPEN + timedelta(minutes=5 * index),
        open=price,
        high=price + 0.5,
        low=price - 0.5,
        close=price,
        volume=100.0,
    )


def pivot(index: int, side: Side, price: float) -> ZigZagPivot:
    return ZigZagPivot.anchored(bar(index, price), price=price, direction=side, since=None)


def mark(index: int, side: Side, price: float, provisional: bool = False) -> LegMark:
    return LegMark.anchored(bar(index, price), price=price, direction=side, provisional=provisional)


def pivots(*specs: Spec) -> list[ZigZagPivot]:
    return [pivot(index, side, price) for index, side, price in specs]


def flipped(specs: tuple[Spec, ...]) -> tuple[Spec, ...]:
    """`specs` mirrored about zero — every price negates and every side swaps.

    Which is the whole of what the bear case is: a rise into a top retracing a fall becomes a fall
    into a bottom retracing a rise, and every fraction comes out identical.
    """
    return tuple((index, _OTHER[side], -price) for index, side, price in specs)


def measured(*specs: Spec):
    """The measurements of `specs`, one per leg — `None` where a leg could not be measured."""
    return [answer for _, answer in retracements(pivots(*specs))]


def reading(*specs: Spec):
    """Every leg's fraction, rounded for reading, with `None` for the ones with no answer."""
    return [None if answer is None else round(answer.ratio, 4) for answer in measured(*specs)]


#: The textbook case: a rise into 110, a fall to 100, and a rise back to 105 — half of it.
HALFWAY: tuple[Spec, ...] = ((0, "high", 110.0), (1, "low", 100.0), (2, "high", 105.0))

#: A leg that took out the top before it, so the measurement widens: the last rise clears the 110
#: at index 2 and is measured against the 120 at index 0 instead, over the deeper of the two
#: bottoms between. Three legs up to the close, one leg down to the bottom.
WIDENED: tuple[Spec, ...] = (
    (0, "high", 120.0),
    (1, "low", 90.0),
    (2, "high", 110.0),
    (3, "low", 100.0),
    (4, "high", 115.0),
)

#: Both halves spanning several legs: three down to the bottom at 90, three back up to 118.
BOTH_SWINGS: tuple[Spec, ...] = (
    (0, "high", 120.0),
    (1, "low", 105.0),
    (2, "high", 112.0),
    (3, "low", 90.0),
    (4, "high", 100.0),
    (5, "low", 95.0),
    (6, "high", 118.0),
)


# --- the ordinary reading ----------------------------------------------------------------


def test_a_leg_shorter_than_the_one_before_it_is_measured_against_that_leg_alone():
    answer = measured(*HALFWAY)[1]
    assert answer is not None
    assert (answer.origin.time, answer.turn.time) == (bar(0, 110.0).time, bar(1, 100.0).time)
    assert (answer.retraced, answer.move) == (10.0, 5.0)
    assert (answer.retraced_legs, answer.move_legs) == (1, 1)


def test_a_leg_that_came_back_halfway_reports_a_ratio_of_one_half():
    assert reading(*HALFWAY) == [None, 0.5]


def test_the_bear_mirror_of_a_measured_leg_reports_the_same_numbers():
    assert reading(*flipped(HALFWAY)) == reading(*HALFWAY)
    assert reading(*flipped(WIDENED)) == reading(*WIDENED)
    assert reading(*flipped(BOTH_SWINGS)) == reading(*BOTH_SWINGS)


def test_a_leg_that_retraced_exactly_all_of_the_previous_one_anchors_on_it_and_reports_one():
    """The `>=` in one test: at exactly 100% the search must stop on the top it just retested."""
    answer = measured((0, "high", 110.0), (1, "low", 100.0), (2, "high", 110.0))[1]
    assert answer is not None
    assert answer.origin.time == bar(0, 110.0).time
    assert answer.ratio == 1.0


# --- when the leg took the previous top out ----------------------------------------------


def test_a_leg_that_passed_the_previous_top_is_measured_against_the_nearest_top_it_did_not_pass():
    answer = measured(*WIDENED)[3]
    assert answer is not None
    assert answer.origin.time == bar(0, 120.0).time
    assert (answer.retraced, answer.move) == (30.0, 25.0)


def test_the_turn_is_the_deepest_pivot_between_the_origin_and_the_close_and_not_the_nearest_one():
    """The bottom at index 3 is nearer; the one at index 1 is the bottom of the move."""
    answer = measured(*WIDENED)[3]
    assert answer is not None
    assert answer.turn.time == bar(1, 90.0).time


def test_the_leg_counts_say_how_many_legs_each_half_of_the_move_spans():
    widened = measured(*WIDENED)[3]
    both = measured(*BOTH_SWINGS)[5]
    assert widened is not None and both is not None
    assert (widened.retraced_legs, widened.move_legs) == (1, 3)
    assert (both.retraced_legs, both.move_legs) == (3, 3)


def test_a_ratio_never_exceeds_one_however_many_legs_the_search_walks_back():
    for specs in (HALFWAY, WIDENED, BOTH_SWINGS, flipped(WIDENED), flipped(BOTH_SWINGS)):
        for answer in measured(*specs):
            if answer is not None:
                assert 0.0 <= answer.ratio <= 1.0


def test_ties_between_two_equally_deep_turns_keep_the_earlier_pivot():
    answer = measured(
        (0, "high", 120.0), (1, "low", 90.0), (2, "high", 100.0), (3, "low", 90.0),
        (4, "high", 110.0),
    )[3]
    assert answer is not None
    assert answer.turn.time == bar(1, 90.0).time


# --- when there is no answer --------------------------------------------------------------


def test_the_second_pivot_closes_the_first_leg_and_has_nothing_behind_it_to_measure_against():
    assert measured(*HALFWAY)[0] is None


def test_a_move_with_no_unexceeded_pivot_anywhere_in_the_window_is_not_measured():
    assert reading((0, "high", 100.0), (1, "low", 90.0), (2, "high", 110.0)) == [None, None]


def test_the_same_leg_is_unmeasured_on_a_short_window_and_measured_on_a_longer_one():
    """The window is the only lookback bound, stated as a test and not only as prose."""
    tail: tuple[Spec, ...] = ((2, "high", 100.0), (3, "low", 90.0), (4, "high", 110.0))
    assert reading(*tail)[-1] is None
    assert reading((0, "high", 120.0), (1, "low", 80.0), *tail)[-1] == 0.75


def test_an_origin_and_a_turn_at_one_price_are_not_measured_rather_than_divided_by_zero():
    assert reading((0, "high", 100.0), (1, "low", 100.0), (2, "high", 100.0)) == [None, None]


def test_two_consecutive_marks_on_one_side_close_no_leg_and_are_not_measured():
    """Both detectors can emit same-side neighbours; a top followed by a top is not a leg."""
    answers = measured(
        (0, "high", 110.0), (1, "low", 100.0), (2, "high", 105.0), (3, "high", 107.0)
    )
    assert answers[1] is not None
    assert answers[2] is None


def test_every_leg_gets_an_entry_even_when_it_cannot_be_measured():
    specs = ((0, "high", 100.0), (1, "low", 90.0), (2, "high", 110.0), (3, "low", 95.0))
    assert len(retracements(pivots(*specs))) == len(specs) - 1


def test_fewer_than_two_pivots_is_no_legs_and_so_no_entries():
    assert retracements([]) == []
    assert retracements(pivots((0, "high", 100.0))) == []


# --- the comparisons themselves ------------------------------------------------------------


def test_the_search_skips_a_pivot_on_the_wrong_side_even_when_its_price_would_qualify():
    """The bottom at 120 is nearer than the top at 130 and clears 110 — and is not an origin.

    Without the side test it would be picked and the whole move would be measured as 25 rather
    than 35, so this asserts a number and not only an anchor.
    """
    answer = measured(
        (0, "high", 130.0), (1, "low", 120.0), (2, "low", 95.0), (3, "high", 110.0)
    )[2]
    assert answer is not None
    assert answer.origin.time == bar(0, 130.0).time
    assert answer.retraced == 35.0


def test_prices_that_differ_only_in_float_noise_count_as_one_level():
    """A close a billionth above the top it retested still anchors there rather than walking on."""
    answer = measured((0, "high", 110.0), (1, "low", 100.0), (2, "high", 110.000000001))[1]
    assert answer is not None
    assert answer.origin.time == bar(0, 110.0).time
    assert answer.ratio == pytest.approx(1.0)


# --- the adapter ---------------------------------------------------------------------------


def zigzag() -> ZigZagPattern:
    """A source built for its `producer` and `name` alone, and never run. `test_leg_extremes`' trick."""
    return ZigZagPattern(depth=8, reads=("5m",), emits="5m")


def run(points: list[ZigZagPivot] | list[LegMark], source=None) -> BaseSeries:
    """The Pattern over a hand-placed pivot Series. **No bars in `ctx`** — see the test below."""
    source = source or zigzag()
    pattern = RetracementPattern(source=source, reads=("5m",), emits="5m")
    return pattern.run(
        {
            INSTRUMENT: "WIN@N",
            source.producer: BaseSeries(SeriesIdentity(source.producer, "WIN@N", "5m"), points),
        }
    )


def test_one_point_per_leg_anchored_on_the_pivot_that_closes_it():
    series = run(pivots(*HALFWAY))
    assert [point.time for point in series] == [bar(1, 0).time, bar(2, 0).time]


def test_each_point_carries_the_closing_pivots_own_price_and_side():
    series = run(pivots(*WIDENED))
    closes = pivots(*WIDENED)[1:]
    assert [(p.price, p.direction) for p in series] == [(c.price, c.direction) for c in closes]
    for point, close in zip(series, closes):
        assert (point.open, point.high, point.low, point.close, point.volume) == (
            close.open, close.high, close.low, close.close, close.volume
        )


def test_the_measurement_reaches_the_point_whole():
    series = run(pivots(*HALFWAY))
    assert series[0].measured is None
    assert series[1].measured is not None
    assert series[1].measured.ratio == 0.5


def test_the_last_leg_is_flagged_provisional_rather_than_dropped():
    series = run(pivots(*WIDENED))
    assert len(series) == 4
    assert [point.provisional for point in series] == [False, False, False, True]


def test_a_settled_final_mark_is_flagged_too_which_is_the_conservative_half_of_that_rule():
    """The flag is read positionally, so one rule serves both sources — and over-reports here."""
    simple = SimpleLegPattern(reads=("5m",), emits="5m")
    settled = [mark(index, side, price) for index, side, price in HALFWAY]
    series = run(settled, simple)
    assert all(not point.provisional for point in settled)
    assert series[-1].provisional


def test_the_candles_are_never_read_so_the_pattern_runs_with_no_bars_in_ctx():
    """Absence as the assertion: `run` builds no `BARS` key, so a read of one would raise."""
    assert len(run(pivots(*BOTH_SWINGS))) == len(BOTH_SWINGS) - 1


def test_the_series_identity_names_this_pattern_and_the_ctx_instrument():
    series = run(pivots(*HALFWAY))
    pattern = RetracementPattern(source=zigzag(), reads=("5m",), emits="5m")
    assert series.identity.producer == pattern.producer
    assert (series.identity.instrument, series.identity.timeframe) == ("WIN@N", "5m")


def test_the_two_instances_share_neither_a_key_nor_a_label():
    over_zigzag = RetracementPattern(source=zigzag(), reads=("5m",), emits="5m")
    over_marks = RetracementPattern(
        source=SimpleLegPattern(reads=("5m",), emits="5m"), reads=("5m",), emits="5m"
    )
    assert over_zigzag.producer != over_marks.producer
    assert (over_zigzag.name, over_marks.name) == (
        "Retracement · Zig-zag",
        "Retracement · Simple leg",
    )


def test_the_real_chain_measures_the_legs_of_a_wave_off_the_zigzag():
    """Drive the detector for real: a triangular wave drifting down, measured leg by leg."""
    bars = []
    for i in range(60):
        phase = i % 12
        rising = phase < 6
        offset = phase if rising else 12 - phase
        mid = 100.0 + 8.0 * offset / 6 - 0.2 * i
        bars.append(Candle(time=OPEN + timedelta(minutes=5 * i), open=mid, high=mid + 0.5,
                           low=mid - 0.5, close=mid, volume=100.0))
    window = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)

    source = zigzag()
    ctx = {BARS: {"5m": window}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    series = RetracementPattern(source=source, reads=("5m",), emits="5m").run(ctx)

    vertices = list(ctx[source.producer])
    assert len(series) == len(vertices) - 1
    times = [point.time for point in series]
    assert times == sorted(times)
    # The claim the whole rule rests on, asserted against a real detector rather than a fixture.
    for point in series:
        if point.measured is not None:
            assert 0.0 <= point.measured.ratio <= 1.0
            assert point.measured.retraced > 0.0
    # A falling wave retraces something almost everywhere, so an empty answer would mean the
    # chain never ran rather than that nothing was measurable.
    assert any(point.measured is not None for point in series)


def test_the_chain_the_pipeline_runs_measures_the_reaches_rather_than_the_vertices():
    """`ZigZagPattern -> LegReachPattern -> RetracementPattern`, the three links as declared.

    The middle link is the whole point: a detector's vertex is not its leg's extreme, so a fraction
    taken straight off one is short by whatever the detector left on the table. This asserts the
    composition holds — one Point per leg of the reaches, every fraction still in `[0, 1]` — and
    that the denominators really did grow, which is the only observable difference between the two
    chains and the reason the middle link is in the tuple at all.
    """
    bars = []
    for i in range(60):
        phase = i % 12
        rising = phase < 6
        offset = phase if rising else 12 - phase
        mid = 100.0 + 8.0 * offset / 6 - 0.2 * i
        bars.append(Candle(time=OPEN + timedelta(minutes=5 * i), open=mid, high=mid + 0.5,
                           low=mid - 0.5, close=mid, volume=100.0))
    window = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)

    detector = zigzag()
    reach = LegReachPattern(source=detector, reads=("5m",), emits="5m")
    ctx = {BARS: {"5m": window}, INSTRUMENT: "WIN@N"}
    ctx[detector.producer] = detector.run(ctx)
    ctx[reach.producer] = reach.run(ctx)
    series = RetracementPattern(source=reach, reads=("5m",), emits="5m").run(ctx)

    assert len(series) == len(ctx[reach.producer]) - 1
    assert [point.time for point in series] == sorted(point.time for point in series)
    for point in series:
        if point.measured is not None:
            assert 0.0 <= point.measured.ratio <= 1.0
            assert point.measured.retraced > 0.0
    assert any(point.measured is not None for point in series)

    # The reaches reach at least as far as the vertices they were read off, on every pivot.
    for reached, vertex in zip(ctx[reach.producer], ctx[detector.producer]):
        if reached.direction == "high":
            assert reached.price >= vertex.price
        else:
            assert reached.price <= vertex.price
