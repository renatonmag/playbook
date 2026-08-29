"""Tests for the grouping of simple legs into zigzag legs, and its adapter.

Two layers, tested apart, as `test_leg_window.py` does it. `nested_legs` is handed `LegWindow`s
and `Leg`s built by hand, so a leg can be placed *exactly* on a boundary — which is the whole of
the rule and impossible to arrange with two detectors in the way. The adapter is then checked for
what an adapter promises, and one test at the bottom drives the real four-Pattern chain to prove
the pieces agree.

Almost every assertion is about a boundary, because the interval is left-exclusive and
right-inclusive and either end being wrong puts a leg in the neighbouring group, which looks
entirely plausible.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_processor import Leg, LegPattern
from pattern_engine.patterns.leg_window import LegWindow, LegWindowPattern, split_leg_windows
from pattern_engine.patterns.nested_legs import NestedLegs, NestedLegsPattern, nested_legs
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


def windows(bars: BaseSeries[Candle], *at: int, ahead: int = 5) -> list[LegWindow]:
    """`LegWindow`s cut at the given bar indices, one leg between each pair.

    Built through `split_leg_windows` rather than by hand, so `end` is whatever the real slicer
    says it is: this file is about the grouping, and an `end` invented here could disagree with
    the one every other module reads.
    """
    pivots = [
        ZigZagPivot.anchored(
            bars[index], price=bars[index].close, direction="high" if i % 2 else "low", since=None
        )
        for i, index in enumerate(at)
    ]
    return split_leg_windows(bars.points, pivots, ahead)


def legs(bars: BaseSeries[Candle], *spans: tuple[int, int]) -> list[Leg]:
    """Simple legs placed by hand as `(first bar, last bar)`, inclusive at both ends.

    Placed directly rather than run through a detector, because what needs saying is where a leg
    *starts* relative to a vertex, and no detector can be asked to start one on a given bar.
    """
    return [Leg.anchored(bars[start], bars=tuple(bars.points[start : end + 1])) for start, end in spans]


def run(bars: BaseSeries[Candle]) -> BaseSeries[NestedLegs]:
    """The whole chain — both detectors, both slicers, then the grouper — as a pipeline would."""
    zigzag = ZigZagPattern(depth=4, reads=("5m",), emits="5m")
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    simple_legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")

    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    for pattern in (zigzag, simple_leg, leg_windows, simple_legs):
        ctx[pattern.producer] = pattern.run(ctx)

    return NestedLegsPattern(
        source=leg_windows, legs=simple_legs, reads=("5m",), emits="5m"
    ).run(ctx)


def starts(group: NestedLegs) -> list[datetime]:
    """Where each leg of a group starts — the only field the rule reads."""
    return [leg.time for leg in group.inside]


# --- the grouping rule ------------------------------------------------------------------


def test_a_leg_starting_inside_the_zigzag_leg_is_in_its_group():
    bars = wave()
    grouped = nested_legs(windows(bars, 0, 10, 20), legs(bars, (3, 7), (12, 16)))

    assert starts(grouped[0]) == [bars[3].time]
    assert starts(grouped[1]) == [bars[12].time]


def test_a_leg_starting_on_the_opening_vertex_belongs_to_the_previous_group():
    bars = wave()
    # Bar 10 closes the first leg and opens the second. The interval is left-exclusive, so the
    # leg starting there is the first group's — the boundary bar is where the first leg ended.
    grouped = nested_legs(windows(bars, 0, 10, 20), legs(bars, (10, 14)))

    assert starts(grouped[0]) == [bars[10].time]
    assert grouped[1].inside == ()


def test_a_leg_starting_on_the_closing_vertex_is_in_this_group():
    bars = wave()
    grouped = nested_legs(windows(bars, 0, 10, 20), legs(bars, (20, 24)))

    assert starts(grouped[1]) == [bars[20].time]


def test_the_limit_is_the_closing_vertex_not_the_end_of_the_window():
    bars = wave()
    # Bar 12 is inside the first window's `ahead` tail — it is in `bars`, and it is not in the
    # group. Grouping by the tail would put this leg in two groups at once.
    first, second = nested_legs(windows(bars, 0, 10, 20, ahead=5), legs(bars, (12, 16)))

    assert first.inside == ()
    assert starts(second) == [bars[12].time]
    assert any(bar.time == bars[12].time for bar in first.leg.bars), "the bar is in the window"


def test_the_groups_partition_the_legs_so_none_appears_twice():
    bars = wave()
    placed = legs(bars, (2, 6), (7, 11), (13, 17), (18, 22), (24, 28))
    grouped = nested_legs(windows(bars, 0, 10, 20, 30), placed)

    seen = [leg for group in grouped for leg in group.inside]
    assert len(seen) == len({leg.time for leg in seen}) == 5
    assert seen == placed


def test_a_zigzag_leg_with_nothing_inside_it_still_gets_a_point():
    bars = wave()
    grouped = nested_legs(windows(bars, 0, 10, 20), legs(bars, (12, 16)))

    assert len(grouped) == 2
    assert grouped[0].inside == ()


def test_legs_before_the_first_vertex_and_after_the_last_are_dropped():
    bars = wave(count=60)
    grouped = nested_legs(windows(bars, 10, 20, 30), legs(bars, (2, 6), (12, 16), (40, 44)))

    assert [starts(group) for group in grouped] == [[bars[12].time], []]


def test_a_leg_starting_on_the_very_first_vertex_is_in_no_group():
    bars = wave()
    # `split_legs` folds the window's head into its first leg, so that leg starts on bar 0 —
    # before every vertex, and in no group. The rule that drops it is the left-exclusive one.
    grouped = nested_legs(windows(bars, 0, 10, 20), legs(bars, (0, 4)))

    assert all(group.inside == () for group in grouped)


def test_a_group_can_hold_a_leg_that_runs_past_the_close():
    bars = wave()
    # `split_legs` gives its last leg the whole remainder, so a leg starting just inside a zigzag
    # leg can end far outside it. The grouping is by where a leg starts and says so.
    group = nested_legs(windows(bars, 0, 10, 20), legs(bars, (18, 59)))[1]

    assert starts(group) == [bars[18].time]
    assert group.inside[0].bars[-1].time > group.leg.bars[group.leg.end].time


def test_every_point_carries_the_window_it_grouped_for():
    bars = wave()
    placed = windows(bars, 0, 10, 20)
    grouped = nested_legs(placed, legs(bars, (3, 7)))

    assert [group.leg for group in grouped] == placed
    assert [group.time for group in grouped] == [window.time for window in placed]
    assert grouped[0].close == placed[0].close, "anchored on the leg's opening vertex"


def test_the_newest_leg_is_grouped_like_any_other():
    bars = wave()
    # Unlike `leg-extremes`, which drops it: nothing is measured here, and dropping it would drop
    # the newest simple legs.
    placed = windows(bars, 0, 10, 20)
    grouped = nested_legs(placed, legs(bars, (15, 19)))

    assert len(grouped) == len(placed)
    assert starts(grouped[-1]) == [bars[15].time]


def test_no_windows_yields_nothing():
    bars = wave()

    assert nested_legs([], legs(bars, (3, 7))) == []


def test_no_legs_still_yields_one_point_per_window():
    bars = wave()

    assert [group.inside for group in nested_legs(windows(bars, 0, 10, 20), [])] == [(), ()]


# --- the adapter ------------------------------------------------------------------------


def test_the_producer_key_names_the_whole_chain():
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    pattern = NestedLegsPattern(
        source=LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m"),
        legs=LegPattern(source=simple_leg, reads=("5m",), emits="5m"),
        reads=("5m",),
        emits="5m",
    )

    assert pattern.producer == (
        "nested-legs("
        "source=<leg-window(source=<zig-zag(depth=8,reads=5m,emits=5m)>,ahead=5,reads=5m,emits=5m)>,"
        "legs=<leg(source=<simple-leg(reads=5m,emits=5m)>,reads=5m,emits=5m)>,"
        "reads=5m,emits=5m)"
    )


def test_the_series_carries_the_identity_of_the_run():
    series = run(wave(count=120))

    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"
    assert series.identity.producer.startswith("nested-legs(")


def test_a_real_run_groups_every_simple_leg_that_starts_inside_a_zigzag_leg():
    bars = wave(count=120)
    series = run(bars)

    assert series, "the wave should produce legs at this depth"
    for group in series:
        opened = group.time
        closes = group.leg.bars[group.leg.end].time
        for leg in group.inside:
            assert opened < leg.time <= closes
    # And the groups are still a partition once real detectors place the legs.
    seen = [leg.time for group in series for leg in group.inside]
    assert len(seen) == len(set(seen))


def test_the_points_are_ordered_and_one_per_leg_of_the_source():
    bars = wave(count=120)
    zigzag = ZigZagPattern(depth=4, reads=("5m",), emits="5m")
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[zigzag.producer] = zigzag.run(ctx)
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    ctx[leg_windows.producer] = leg_windows.run(ctx)

    series = run(bars)
    anchors = [point.time for point in series]

    assert len(series) == len(ctx[leg_windows.producer])
    assert anchors == sorted(anchors)


def test_an_empty_window_produces_an_empty_series():
    assert not run(BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), []))
