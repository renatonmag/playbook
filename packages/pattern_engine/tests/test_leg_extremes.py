"""Tests for a leg's three defining points, and the Pattern that finds them.

Two layers, tested apart, the same way `test_leg_reversals.py` does it.

`extreme_points` is handed Candles built by hand, and every fixture below is built so that the
three answers land on **three different bars**. That is the whole difficulty of this Pattern: a
fixture where the highest high, the highest close and the highest low happen to coincide would
pass whatever the code did with the other two readings.

The Pattern is then driven with pivots placed by hand rather than by a detector, which is what
lets the *same bars* close on a low or on a high — the one thing the direction rule has to be
tested against.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_extremes import (
    LegExtremes,
    LegExtremesPattern,
    extreme_points,
)
from pattern_engine.patterns.advancing_legs import AdvancingLeg, AdvancingLegsPattern
from pattern_engine.patterns.leg_processor import LegPattern
from pattern_engine.patterns.leg_window import LegWindowPattern, split_leg_windows
from pattern_engine.patterns.nested_legs import NestedLegsPattern
from pattern_engine.patterns.simple_leg import SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: `(open, high, low, close)` per bar. Read down the `high`, `close` and `low` columns: the top
#: of each is on a different row, which is what makes the fixture worth anything.
#:
#: high  peaks at bar 4 (140), close peaks at bar 2 (128), low peaks at bar 6 (120).
#:
#: Bar 4 is a spike — it reaches furthest and closes back down. Bar 2 closes highest but never
#: traded as high. Bar 6 is the quiet one that never gave anything back, so it holds the highest
#: floor. Exactly the three-way disagreement the Pattern exists to report.
RISING = (
    (100.0, 110.0, 98.0, 105.0),
    (105.0, 118.0, 104.0, 112.0),
    (112.0, 130.0, 110.0, 128.0),  # highest close
    (128.0, 132.0, 115.0, 118.0),
    (118.0, 140.0, 112.0, 120.0),  # highest high
    (120.0, 126.0, 118.0, 124.0),
    (124.0, 129.0, 120.0, 126.0),  # highest low
)


#: Two bars appended after `RISING` so that a leg over `RISING` is no longer the **last** leg,
#: which is the one this Pattern refuses to measure. They carry a third vertex and nothing else:
#: every test using them cuts its leg at bar 6 with `ahead=0`, so the window under test is still
#: exactly `RISING` and the expected points are unchanged by their presence.
#:
#: They fall hard, on purpose — a `low` of 88 that no reading of a bull leg over `RISING` could
#: ever pick up, so a bar of the skipped leg leaking into a measured one would show as a wrong
#: number rather than as a coincidence.
AFTER = (
    (126.0, 128.0, 90.0, 92.0),
    (92.0, 94.0, 88.0, 90.0),
)


def flipped(
    specs: tuple[tuple[float, float, float, float], ...],
) -> tuple[tuple[float, float, float, float], ...]:
    """`specs` mirrored about zero — `high` and `low` swap, and every price negates.

    Written as a transform rather than a second hand-typed table so the bear fixture cannot
    drift from the bull one. A bear leg's three points are the vertical mirror of a bull leg's,
    which is the claim these tests make, and a mirrored fixture is how it gets made honestly.
    """
    return tuple((-o, -low, -high, -c) for o, high, low, c in specs)


def series(*specs: tuple[float, float, float, float], start: datetime = OPEN) -> BaseSeries[Candle]:
    """Candles at five-minute spacing from `start`, one per `(open, high, low, close)`."""
    bars = [
        Candle(
            time=start + timedelta(minutes=5 * i),
            open=spec[0],
            high=spec[1],
            low=spec[2],
            close=spec[3],
            volume=100.0,
        )
        for i, spec in enumerate(specs)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


def vertices(bars: BaseSeries[Candle], *placed: tuple[int, int | None, str]) -> list[ZigZagPivot]:
    """Vertices placed by hand as `(vertex index, turn index, which extreme)`.

    `direction` is written out rather than alternated, because it is the input the Pattern reads
    to decide which way a leg ran — the one thing these tests exist to vary.
    """
    return [
        ZigZagPivot.anchored(
            bars[at],
            price=bars[at].close,
            direction=direction,
            since=bars[turn] if turn is not None else None,
        )
        for at, turn, direction in placed
    ]


def run(
    bars: BaseSeries[Candle],
    *placed: tuple[int, int | None, str],
    ahead: int = 5,
    pivots_shown: int | None = None,
) -> BaseSeries[LegExtremes]:
    """Build the two source Series by hand and run the Pattern over them, as a pipeline would.

    The legs are cut from *all* the vertices; `pivots_shown` truncates only the Series the Pattern
    reads for directions, which is how a mismatched pipeline is simulated without building one.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    windows = LegWindowPattern(source=zigzag, ahead=ahead, reads=("5m",), emits="5m")
    placed_pivots = vertices(bars, *placed)

    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[zigzag.producer] = BaseSeries(
        SeriesIdentity(zigzag.producer, "WIN@N", "5m"), placed_pivots[:pivots_shown]
    )
    ctx[windows.producer] = BaseSeries(
        SeriesIdentity(windows.producer, "WIN@N", "5m"),
        split_leg_windows(bars.points, placed_pivots, ahead),
    )

    return LegExtremesPattern(
        source=windows, pivots=zigzag, reads=("5m",), emits="5m"
    ).run(ctx)


def advancing() -> AdvancingLegsPattern:
    """An `AdvancingLegsPattern` built the way the pipeline builds it.

    Never run — only its `producer` and its `name` are wanted, which are exactly what a second
    source has to offer this Pattern. Built out of the real chain rather than a stand-in, so that
    the key these tests seed `ctx` under is the key a pipeline would.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")
    nested = NestedLegsPattern(source=windows, legs=legs, reads=("5m",), emits="5m")
    return AdvancingLegsPattern(
        source=nested, pivots=zigzag, marks=simple_leg, reads=("5m",), emits="5m"
    )


def run_advancing(*legs: tuple[BaseSeries[Candle], str]) -> BaseSeries[LegExtremes]:
    """Run the Pattern over legs that name their own direction, with **no pivots anywhere**.

    Each argument is one leg's bars and the direction that leg says it ran. `ctx` holds the source
    Series and nothing else — no zigzag key, so a run that reached for one would raise `KeyError`
    rather than quietly pass. That absence is the assertion, and it is why this helper does not
    share `run`'s body.
    """
    source = advancing()
    points = [
        AdvancingLeg.anchored(
            bars[0], bars=tuple(bars.points), direction=direction, group=direction
        )
        for bars, direction in legs
    ]

    ctx = {INSTRUMENT: "WIN@N"}
    ctx[source.producer] = BaseSeries(SeriesIdentity(source.producer, "WIN@N", "5m"), points)

    return LegExtremesPattern(source=source, reads=("5m",), emits="5m").run(ctx)


def listed(point: LegExtremes) -> list[tuple[str, int, float]]:
    """A leg's findings as `(type, at, price)`, which is what every assertion here is about."""
    return [(found.type, found.at, found.price) for found in point.found]


# --- the three readings -------------------------------------------------------------------


def test_the_three_points_of_a_bull_leg_are_the_high_the_close_and_the_low():
    bars = series(*RISING).points

    assert [
        (found.type, found.at, found.price) for found in extreme_points(bars, "bullish")
    ] == [("reach", 4, 140.0), ("close", 2, 128.0), ("hold", 6, 120.0)]


def test_a_bear_leg_reads_the_mirror_of_a_bull_legs_three_fields():
    bars = series(*flipped(RISING)).points

    assert [
        (found.type, found.at, found.price) for found in extreme_points(bars, "bearish")
    ] == [("reach", 4, -140.0), ("close", 2, -128.0), ("hold", 6, -120.0)]


def test_a_point_carries_the_whole_bar_it_landed_on_not_only_its_winning_price():
    bars = series(*RISING).points

    reach = extreme_points(bars, "bullish")[0]

    assert reach.time == bars[4].time
    assert (reach.open, reach.high, reach.low, reach.close) == (118.0, 140.0, 112.0, 120.0)


def test_the_order_is_reach_close_hold_and_not_the_order_the_bars_fell_in():
    # `at` runs 4, 2, 6 here — deliberately not ascending, so a Pattern that quietly sorted by
    # bar would be caught. The three are asked for by name, so the name decides the order.
    assert [found.type for found in extreme_points(series(*RISING).points, "bullish")] == [
        "reach",
        "close",
        "hold",
    ]


def test_a_tie_keeps_the_earliest_bar_that_reached_the_level():
    # Bars 1 and 3 both top out at 130. Bar 3 also carries the highest close, so a tie rule that
    # leaned on the later bar would make `reach` and `close` agree and hide itself.
    bars = series(
        (100.0, 120.0, 98.0, 110.0),
        (110.0, 130.0, 108.0, 115.0),
        (115.0, 122.0, 112.0, 118.0),
        (118.0, 130.0, 116.0, 129.0),
    ).points

    assert [(found.type, found.at) for found in extreme_points(bars, "bullish")] == [
        ("reach", 1),
        ("close", 3),
        ("hold", 3),
    ]


def test_a_bear_leg_breaks_a_tie_the_same_way_towards_the_earlier_bar():
    bars = series(*flipped(
        (
            (100.0, 120.0, 98.0, 110.0),
            (110.0, 130.0, 108.0, 115.0),
            (115.0, 122.0, 112.0, 118.0),
            (118.0, 130.0, 116.0, 129.0),
        )
    )).points

    assert [(found.type, found.at) for found in extreme_points(bars, "bearish")] == [
        ("reach", 1),
        ("close", 3),
        ("hold", 3),
    ]


def test_a_tie_is_broken_per_reading_and_not_once_for_the_leg():
    # `high` ties across bars 0 and 2, `close` and `low` do not. Each reading answers on its own.
    bars = series(
        (100.0, 130.0, 90.0, 105.0),
        (105.0, 120.0, 100.0, 118.0),
        (118.0, 130.0, 95.0, 120.0),
    ).points

    assert [(found.type, found.at) for found in extreme_points(bars, "bullish")] == [
        ("reach", 0),
        ("close", 2),
        ("hold", 1),
    ]


def test_one_bar_answers_all_three_readings_at_once():
    bars = series((100.0, 110.0, 95.0, 105.0)).points

    assert [
        (found.type, found.at, found.price) for found in extreme_points(bars, "bullish")
    ] == [("reach", 0, 110.0), ("close", 0, 105.0), ("hold", 0, 95.0)]


def test_no_bars_is_no_points_rather_than_an_error():
    assert extreme_points([], "bullish") == []


# --- the Pattern --------------------------------------------------------------------------


def test_the_same_bars_read_as_a_bull_leg_and_as_a_bear_leg_give_different_points():
    bars = series(*RISING, *AFTER)

    # Bar 0 to bar 6, with no tail to reach into, so the two runs differ only in direction. The
    # third vertex is what makes that leg a measured one — the leg after it is the unclosed one.
    bull = run(bars, (0, None, "low"), (6, 2, "high"), (8, 7, "low"), ahead=0)
    bear = run(bars, (0, None, "high"), (6, 2, "low"), (8, 7, "high"), ahead=0)

    assert listed(bull[0]) == [("reach", 4, 140.0), ("close", 2, 128.0), ("hold", 6, 120.0)]
    assert listed(bear[0]) == [("reach", 0, 98.0), ("close", 0, 105.0), ("hold", 0, 110.0)]


def test_the_direction_is_the_legs_own_and_is_not_mirrored_into_the_turn_it_invites():
    # A leg closing on a high is a rise, and a rise is `bullish` here — even though the bar that
    # would *turn* it is a bearish one. `LegReversalsPattern` reports the opposite value from the
    # same input, on purpose, and the two must not be reconciled.
    bars = series(*RISING, *AFTER)

    assert run(bars, (0, None, "low"), (6, 2, "high"), (8, 7, "low"), ahead=0)[0].direction == (
        "bullish"
    )
    assert run(bars, (0, None, "high"), (6, 2, "low"), (8, 7, "high"), ahead=0)[0].direction == (
        "bearish"
    )


def test_the_reach_can_land_in_the_tail_past_the_legs_closing_vertex():
    # The leg closes at bar 3; bar 5 is in its tail and trades higher than anything inside it.
    bars = series(
        (100.0, 110.0, 98.0, 108.0),
        (108.0, 118.0, 106.0, 116.0),
        (116.0, 124.0, 114.0, 122.0),
        (122.0, 130.0, 120.0, 128.0),
        (128.0, 134.0, 126.0, 132.0),
        (132.0, 150.0, 130.0, 148.0),
        (148.0, 152.0, 100.0, 105.0),
    )

    leg = run(bars, (0, None, "low"), (3, 1, "high"), (6, 4, "low"), ahead=2)[0]
    window_end = 3

    reach = leg.found[0]
    assert (reach.at, reach.price) == (5, 150.0)
    assert reach.at > window_end


def test_one_point_per_leg_anchored_where_its_leg_window_is_bar_the_last():
    """The anchors are a *prefix* of `leg-windows`', never the whole of it.

    The relationship the two Series now stand in, stated once: same anchors, same order, one
    fewer — so a reader joining them must join on `time` and not by position.
    """
    bars = series(*RISING)
    placed = ((0, None, "low"), (3, 1, "high"), (6, 4, "low"))

    legs = run(bars, *placed, ahead=1)
    windows = split_leg_windows(bars.points, vertices(bars, *placed), 1)

    assert len(windows) == 2
    assert len(legs) == len(windows) - 1
    assert [leg.time for leg in legs] == [window.time for window in windows[:-1]]
    assert windows[-1].time not in {leg.time for leg in legs}


# --- the leg that is still running -----------------------------------------------------------


def test_the_last_leg_is_not_measured_because_its_closing_vertex_can_still_move():
    """The newest vertex is provisional, so the leg it closes has not finished happening.

    Stated on the anchors rather than on a count alone: it is the *last* leg that goes missing,
    not an arbitrary one.
    """
    bars = series(*RISING, *AFTER)
    placed = ((0, None, "low"), (6, 2, "high"), (8, 7, "low"))

    legs = run(bars, *placed, ahead=0)
    windows = split_leg_windows(bars.points, vertices(bars, *placed), 0)

    assert [window.time for window in windows] == [bars[0].time, bars[6].time]
    assert [leg.time for leg in legs] == [bars[0].time]


def test_two_vertices_is_one_leg_and_that_leg_is_the_last_one_so_nothing_is_measured():
    """The `[:-1]` needs no guard, and this is the case that would have needed it."""
    bars = series(*RISING)

    assert list(run(bars, (0, None, "low"), (6, 2, "high"), ahead=0)) == []


def test_a_bar_beyond_the_measured_legs_tail_cannot_win_a_reading():
    """The defect this skip exists for, in the direction it actually bit.

    The last `LegWindow` swallows *every* remaining bar rather than `ahead` of them, so its
    `reach` used to be drawn from an unbounded stretch of the leg still forming. Bar 8 here
    trades far above anything in the leg; nothing in the output may mention it.
    """
    bars = series(
        (100.0, 110.0, 98.0, 108.0),
        (108.0, 118.0, 106.0, 116.0),
        (116.0, 124.0, 114.0, 122.0),
        (122.0, 130.0, 120.0, 128.0),  # the closing vertex of the measured leg
        (128.0, 129.0, 118.0, 122.0),
        (122.0, 124.0, 114.0, 118.0),
        (118.0, 120.0, 100.0, 104.0),  # the vertex the unclosed leg turns on
        (104.0, 112.0, 102.0, 110.0),
        (110.0, 999.0, 108.0, 998.0),  # only reachable through the unbounded tail
    )

    legs = run(bars, (0, None, "low"), (3, 1, "high"), (6, 4, "low"), ahead=2)

    assert len(legs) == 1
    assert 999.0 not in {found.price for leg in legs for found in leg.found}
    assert listed(legs[0])[0] == ("reach", 3, 130.0)


def test_every_leg_carries_exactly_three_points():
    bars = series(*RISING)

    legs = run(bars, (0, None, "low"), (3, 1, "high"), (6, 4, "low"), ahead=1)

    assert all(len(leg.found) == 3 for leg in legs)


def test_the_series_identity_names_this_pattern_and_the_ctx_instrument():
    bars = series(*RISING)

    legs = run(bars, (0, None, "low"), (6, 2, "high"), ahead=0)

    assert legs.identity.producer.startswith("leg-extremes(")
    assert legs.identity.instrument == "WIN@N"
    assert legs.identity.timeframe == "5m"


def test_fewer_than_two_vertices_is_no_legs_and_so_no_points():
    bars = series(*RISING)

    assert list(run(bars, (0, None, "low"), ahead=0)) == []


def test_pivots_that_do_not_reach_a_legs_close_raise_rather_than_guess_a_direction():
    bars = series(*RISING, *AFTER)

    # `pivots_shown=1` hides the vertex at bar 6, which closes the *measured* leg. Hiding only
    # the last vertex would no longer raise, and deliberately so: that leg is never asked about.
    with pytest.raises(ValueError) as caught:
        run(bars, (0, None, "low"), (6, 2, "high"), (8, 7, "low"), ahead=0, pivots_shown=1)

    message = str(caught.value)
    assert "zig-zag(" in message
    assert "leg-window(" in message


# --- a source that names its own direction ----------------------------------------------------


def test_a_leg_that_carries_its_direction_is_measured_without_any_pivots():
    """The whole of what the optional second source buys: `ctx` here holds no vertices at all."""
    legs = run_advancing(
        (series(*RISING), "bullish"),
        (series(*AFTER, start=OPEN + timedelta(minutes=35)), "bearish"),
    )

    assert len(legs) == 1
    assert legs[0].direction == "bullish"
    assert listed(legs[0]) == [("reach", 4, 140.0), ("close", 2, 128.0), ("hold", 6, 120.0)]


def test_the_direction_read_off_the_point_is_the_one_the_readings_are_taken_for():
    """The mirror of the test above, on the mirrored bars, to pin that nothing is re-derived."""
    legs = run_advancing(
        (series(*flipped(RISING)), "bearish"),
        (series(*AFTER, start=OPEN + timedelta(minutes=35)), "bullish"),
    )

    assert legs[0].direction == "bearish"
    assert listed(legs[0]) == [("reach", 4, -140.0), ("close", 2, -128.0), ("hold", 6, -120.0)]


def test_at_indexes_the_legs_own_bars_and_not_the_history_they_came_from():
    """A leg starting well into the day still reports `at` from its own first bar.

    The same claim `extreme_points` makes for a `LegWindow`, restated on the source that has no
    window: `at` is leg-relative, and there is no offset to add back.
    """
    legs = run_advancing(
        (series(*RISING, start=OPEN + timedelta(hours=3)), "bullish"),
        (series(*AFTER, start=OPEN + timedelta(hours=3, minutes=35)), "bearish"),
    )

    assert [found.at for found in legs[0].found] == [4, 2, 6]


def test_the_last_leg_is_not_measured_on_a_flat_source_either():
    """The `[:-1]` is unconditional, and on `advancing-legs` it takes the newest leg of all.

    Flat across groups, so "the last leg" is one leg for the whole Series rather than one per
    group — see the module docstring for what that costs.
    """
    first = series(*RISING)
    second = series(*RISING, start=OPEN + timedelta(hours=1))
    third = series(*RISING, start=OPEN + timedelta(hours=2))

    legs = run_advancing((first, "bullish"), (second, "bearish"), (third, "bullish"))

    assert [leg.time for leg in legs] == [first[0].time, second[0].time]


def test_one_leg_is_the_last_leg_so_a_flat_source_of_one_measures_nothing():
    assert list(run_advancing((series(*RISING), "bullish"))) == []


# --- two instances of one Pattern ---------------------------------------------------------------


def test_the_windowed_instance_keeps_the_producer_key_it_had_before_pivots_became_optional():
    """A default filled in by `_bound_params` must not move a key that names a `ctx` entry."""
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")

    pattern = LegExtremesPattern(source=windows, pivots=zigzag, reads=("5m",), emits="5m")

    assert pattern.producer == (
        "leg-extremes("
        "source=<leg-window(source=<zig-zag(depth=8,reads=5m,emits=5m)>,ahead=5,reads=5m,emits=5m)>,"
        "pivots=<zig-zag(depth=8,reads=5m,emits=5m)>,"
        "reads=5m,emits=5m)"
    )


def test_the_two_instances_share_neither_a_key_nor_a_label():
    """Both are needed, and for different readers: `ctx` is keyed on one, the sidebar shows the other."""
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")

    over_windows = LegExtremesPattern(source=windows, pivots=zigzag, reads=("5m",), emits="5m")
    over_legs = LegExtremesPattern(source=advancing(), reads=("5m",), emits="5m")

    assert over_windows.producer != over_legs.producer
    assert over_windows.name != over_legs.name
    assert over_windows.name == "Leg extremes · Legs +5 bars"
    assert over_legs.name == "Leg extremes · Advancing legs"
