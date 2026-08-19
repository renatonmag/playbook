"""Tests for the extended leg slicer and its adapter.

Two layers, tested apart, the same way `test_leg_processor.py` does it. `split_leg_windows` is
handed `ZigZagPivot`s built by hand — with `since` placed *independently of the vertices*, which
is the whole point of the field and impossible to test with a detector in the way. The adapter is
then checked for what an adapter promises, and one test at the bottom drives a real
`ZigZagPattern` to prove the two agree.

Almost every assertion is about `since` and `end`, because they are inclusive indices and an
off-by-one in either is invisible on a chart.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, Pivot, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_window import LegWindow, LegWindowPattern, split_leg_windows
from pattern_engine.patterns.simple_leg import SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
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


def vertices(bars: BaseSeries[Candle], *placed: tuple[int, int | None]) -> list[ZigZagPivot]:
    """Vertices placed by hand as `(vertex index, turn index)`.

    The turn is what the vertex says about the leg *ending* on it, so it is written next to the
    vertex that closes that leg — mirroring `ZigZagPattern`, and letting a test put it anywhere
    inside the leg rather than wherever a detector happens to land.
    """
    return [
        ZigZagPivot.anchored(
            bars[at],
            price=bars[at].close,
            direction="high" if index % 2 else "low",
            since=bars[turn] if turn is not None else None,
        )
        for index, (at, turn) in enumerate(placed)
    ]


def run(bars: BaseSeries[Candle], source, ahead: int = 5) -> BaseSeries[LegWindow]:
    """Run `source` and then the slicer over its output, the way a pipeline would."""
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    return LegWindowPattern(source=source, ahead=ahead, reads=("5m",), emits="5m").run(ctx)


# --- where the leg turned ---------------------------------------------------------------


def test_since_is_the_turn_the_closing_vertex_recorded_not_the_opening_vertex():
    bars = wave()
    # The leg 10 -> 20 turned at 14: four bars *inside* it, which is the normal case and the
    # only thing this field is for. Read off the vertex that closes the leg, hence `(20, 14)`.
    windows = split_leg_windows(bars.points, vertices(bars, (0, None), (10, 4), (20, 14)), ahead=5)
    middle = windows[1]

    assert middle.since == 4
    assert middle.bars[middle.since] is bars[14]
    assert 0 < middle.since < middle.end


def test_the_leg_as_it_actually_ran_starts_at_the_turn():
    bars = wave()
    windows = split_leg_windows(bars.points, vertices(bars, (0, None), (10, 4), (20, 14)), ahead=5)
    middle = windows[1]

    assert middle.bars[middle.since : middle.end + 1] == tuple(bars.points[14:21])
    # And the vertex-to-vertex segment — what `split_legs` calls the leg — is the wider slice.
    assert middle.bars[: middle.end + 1] == tuple(bars.points[10:21])


def test_since_is_zero_only_when_the_leg_turned_on_its_opening_vertex():
    bars = wave()
    windows = split_leg_windows(bars.points, vertices(bars, (0, None), (10, 0), (20, 10)), ahead=5)

    assert [window.since for window in windows] == [0, 0]
    assert windows[1].bars[0] is bars[10]


def test_a_leg_with_no_recorded_turn_collapses_since_onto_end():
    bars = wave()
    # `_last_start` returns None when the range holds no mark. `since` then sits on `end` rather
    # than on 0, which would claim the leg turned on its opening vertex.
    windows = split_leg_windows(
        bars.points, vertices(bars, (0, None), (10, None), (20, 14)), ahead=5
    )

    assert windows[0].since == windows[0].end
    assert windows[0].bars[windows[0].since : windows[0].end + 1] == (bars[10],)
    assert windows[1].since == 4
    assert len(windows) == 2, "the leg is still emitted"


def test_a_recorded_turn_never_reaches_end_so_the_sentinel_is_unambiguous():
    bars = wave()
    # `_last_start` searches `[previous vertex, this vertex)` — half-open, so the closing vertex
    # is excluded and a real turn cannot land on `end`. That is what makes `since == end` mean
    # "not recorded" and nothing else. The turn here is placed as late as the range allows.
    windows = split_leg_windows(
        bars.points, vertices(bars, (0, None), (10, 9), (20, 19)), ahead=5
    )

    assert [window.since for window in windows] == [9, 9]
    assert all(window.since < window.end for window in windows)


# --- the slicing rule -------------------------------------------------------------------


def test_every_leg_opens_on_a_vertex_and_the_window_head_is_dropped():
    bars = wave()
    # First vertex at bar 4, so four bars sit ahead of it — and they are gone, unlike
    # `split_legs`, which folds them into the first leg.
    windows = split_leg_windows(bars.points, vertices(bars, (4, None), (14, 8), (24, 18)), ahead=5)

    assert windows[0].bars[0] is bars[4]
    assert windows[0].time == bars[4].time
    assert all(window.bars[0].time in {bars[4].time, bars[14].time} for window in windows)


def test_a_middle_leg_carries_exactly_ahead_bars_past_its_close():
    bars = wave()
    # Three legs, so the middle one is neither first nor the remainder-swallowing last.
    placed = vertices(bars, (0, None), (10, 4), (20, 14), (30, 24))
    middle = split_leg_windows(bars.points, placed, ahead=5)[1]

    assert middle.bars[middle.end + 1 :] == tuple(bars.points[21:26])
    assert len(middle.bars[middle.end + 1 :]) == 5


def test_the_last_leg_swallows_the_whole_remainder_not_just_ahead():
    bars = wave(count=60)
    # 39 bars sit past the final vertex — far more than `ahead`, and all of them are kept.
    placed = vertices(bars, (0, None), (10, 4), (20, 14))
    last = split_leg_windows(bars.points, placed, ahead=5)[-1]

    assert last.bars[last.end + 1 :] == tuple(bars.points[21:])
    assert len(last.bars[last.end + 1 :]) == 39


def test_a_tail_comes_up_short_when_the_window_ends_inside_it():
    bars = wave(count=24)
    # The second-to-last leg closes at 20 with three bars left — the one place a tail is shorter
    # than `ahead` without being the last leg's unbounded one.
    placed = vertices(bars, (0, None), (10, 4), (20, 14), (22, 21))
    penultimate = split_leg_windows(bars.points, placed, ahead=5)[1]

    assert penultimate.bars[penultimate.end + 1 :] == tuple(bars.points[21:24])


def test_consecutive_legs_overlap_by_ahead_plus_one_bars():
    bars = wave()
    placed = vertices(bars, (0, None), (10, 4), (20, 14), (30, 24))
    windows = split_leg_windows(bars.points, placed, ahead=5)

    shared = {bar.time for bar in windows[0].bars} & {bar.time for bar in windows[1].bars}
    assert len(shared) == 6
    # The tail of one leg is literally the opening bars of the next, closing vertex included.
    assert windows[0].bars[windows[0].end :] == windows[1].bars[:6]


def test_ahead_of_zero_leaves_the_close_as_the_last_bar():
    bars = wave()
    placed = vertices(bars, (0, None), (10, 4), (20, 14), (30, 24))
    middle = split_leg_windows(bars.points, placed, ahead=0)[1]

    assert middle.end == len(middle.bars) - 1
    assert middle.bars[middle.end + 1 :] == ()


def test_one_vertex_is_not_a_leg_and_yields_nothing():
    # Deliberately unlike `split_legs`, which answers a single vertex with the whole window: a
    # `LegWindow` cannot name an `end` that is not there.
    bars = wave()

    assert split_leg_windows(bars.points, vertices(bars, (10, None)), ahead=5) == []


def test_no_vertices_yields_nothing():
    assert split_leg_windows(wave().points, [], ahead=5) == []


def test_a_vertex_on_no_bar_of_the_window_raises():
    bars = wave()
    stray = ZigZagPivot(
        time=OPEN - timedelta(minutes=5),
        open=1.0,
        high=1.0,
        low=1.0,
        close=1.0,
        volume=0.0,
        price=1.0,
        direction="high",
        since=None,
    )

    with pytest.raises(ValueError, match="sits on no bar"):
        split_leg_windows(bars.points, [*vertices(bars, (0, None)), stray], ahead=5)


# --- the adapter ------------------------------------------------------------------------


def test_the_producer_key_states_the_source_and_the_tail_length():
    source = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    pattern = LegWindowPattern(source=source, ahead=5, reads=("5m",), emits="5m")

    assert pattern.producer == (
        "leg-window(source=<zig-zag(depth=8,reads=5m,emits=5m)>,ahead=5,reads=5m,emits=5m)"
    )


def test_the_series_carries_the_identity_of_the_run():
    series = run(wave(), ZigZagPattern(depth=8, reads=("5m",), emits="5m"))

    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"
    assert series.identity.producer.startswith("leg-window(")


def test_every_point_is_anchored_on_its_own_first_bar():
    for window in run(wave(), ZigZagPattern(depth=8, reads=("5m",), emits="5m")):
        assert window.time == window.bars[0].time
        assert window.close == window.bars[0].close


def test_a_real_zigzag_puts_every_recorded_turn_inside_its_leg():
    bars = wave(count=120)
    source = ZigZagPattern(depth=4, reads=("5m",), emits="5m")
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    windows = LegWindowPattern(source=source, ahead=5, reads=("5m",), emits="5m").run(ctx)
    pivots = ctx[source.producer].points

    assert windows, "the wave should produce legs at this depth"
    assert len(windows) == len(pivots) - 1
    # Each window's turn is the one its *closing* vertex named — the same bar, not a recomputed
    # guess, and not the turn belonging to the vertex that opens the leg.
    for window, closing in zip(windows, pivots[1:]):
        assert window.bars[window.end].time == closing.time
        if closing.since is None:
            assert window.since == window.end
        else:
            assert 0 <= window.since < window.end
            assert window.bars[window.since].time == closing.since.time


def test_a_detector_that_records_no_turn_at_all_is_rejected_loudly():
    # `LegMark` has no `since`, so `SimpleLegPattern` cannot feed this slicer. Failing here beats
    # inventing a turn for every leg.
    with pytest.raises(AttributeError):
        run(wave(), SimpleLegPattern(reads=("5m",), emits="5m"))


def test_an_empty_window_produces_an_empty_series():
    empty = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), [])

    assert not run(empty, ZigZagPattern(depth=8, reads=("5m",), emits="5m"))


def test_a_plain_pivot_is_not_enough():
    # The type annotation says `ZigZagPivot`; this is what the annotation is protecting.
    bars = wave()
    plain = [Pivot.anchored(bars[i], price=bars[i].close) for i in (0, 10, 20)]

    with pytest.raises(AttributeError):
        split_leg_windows(bars.points, plain, ahead=5)
