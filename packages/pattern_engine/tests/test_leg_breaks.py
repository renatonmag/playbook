"""Tests for what a zigzag leg broke, and for the three-Series join that reports it.

Two layers, tested apart, the shape `test_nested_legs.py` and `test_advancing_legs.py` both keep.
`taken_levels` is handed `LegReach`es built by hand, because what needs saying is which *levels*
a close beats and no detector can be asked to place one on a given price. The adapter is then
checked for what it promises — and here that is more than usual, since it joins three Series by
position rather than by anchor and the checks that keep it honest are its own.

The comparison being strict is the assertion that earns the most room: an exact retest reading as
a break would be indistinguishable from the real thing on every chart it appeared on.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_breaks import LegBreak, LegBreaksPattern, taken_levels
from pattern_engine.patterns.leg_processor import LegPattern
from pattern_engine.patterns.leg_reach import LegReach, LegReachPattern
from pattern_engine.patterns.leg_window import LegWindowPattern
from pattern_engine.patterns.nested_legs import NestedLegsPattern
from pattern_engine.patterns.retracement import RetracementPattern
from pattern_engine.patterns.simple_leg import SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def wave(
    count: int = 120, span: float = 8.0, period: int = 12, drift: float = 0.0
) -> BaseSeries[Candle]:
    """Candles tracing a clean triangular wave, so tops and bottoms are unambiguous.

    Longer than `test_nested_legs.py`'s default, because this Pattern is about a leg measured
    against the ones *before* it and a window holding three vertices has almost nothing behind it.

    `drift` tilts the whole wave by that much per bar, and it is the one addition this file makes
    to the shared generator. A wave with no drift repeats its tops **exactly**, so every leg is an
    exact retest and nothing is ever broken — which is a real reading and is asserted below, but
    it is not the one a test about counting breaks can be written against.
    """
    bars = []
    for i in range(count):
        phase = i % period
        rising = phase < period // 2
        offset = phase if rising else period - phase
        mid = 100.0 + span * offset / (period // 2) + drift * i
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


def reaches(*prices: float) -> list[LegReach]:
    """Reaches at the given prices, alternating low, high, low, … from bar 0 onwards.

    Placed by hand rather than run through a detector: every rule here is a comparison between
    two prices on one side, and asking two detectors to land a top on a chosen price is a test
    about them instead of about this.
    """
    bars = wave()
    return [
        LegReach.anchored(
            bars[index],
            price=price,
            direction="high" if index % 2 else "low",
            provisional=index == len(prices) - 1,
        )
        for index, price in enumerate(prices)
    ]


def prices(levels: list[LegReach]) -> list[float]:
    """The broken levels as bare prices — the only field an assertion here cares about."""
    return [level.price for level in levels]


# --- the break rule ---------------------------------------------------------------------


def test_the_first_close_breaks_nothing():
    # Index 0 closes no leg. Nothing is behind it, so there is nothing to break.
    assert taken_levels(reaches(100.0), 0) == []


def test_a_close_beyond_the_swing_before_it_breaks_one():
    # low 100, high 110, low 101, high 115 — the last leg runs from 101 through the standing top
    # at 110 and closes at 115. One level, and the plainest shape the rule has.
    assert prices(taken_levels(reaches(100.0, 110.0, 101.0, 115.0), 3)) == [110.0]


def test_a_close_beyond_several_standing_swings_breaks_all_of_them():
    # The case the Pattern exists for: one leg running through two *live* tops at once. They have
    # to descend — 120 then 115 — or the older one was already taken out by the newer and is not
    # a level any more.
    assert prices(taken_levels(reaches(100.0, 120.0, 90.0, 115.0, 95.0, 125.0), 5)) == [
        120.0,
        115.0,
    ]


def test_a_close_inside_the_range_breaks_nothing():
    assert taken_levels(reaches(100.0, 110.0, 101.0, 108.0), 3) == []


def test_an_exact_retest_is_not_a_break():
    # The assertion this module's strict comparison exists for. A leg stopping dead on the top
    # before it has retested it, not broken it — and `retracement`'s `>=` says the opposite about
    # the same two prices on purpose, because it is asking the opposite question.
    assert taken_levels(reaches(100.0, 110.0, 101.0, 110.0), 3) == []


def test_a_tick_past_an_exact_retest_is_a_break():
    assert prices(taken_levels(reaches(100.0, 110.0, 101.0, 110.01), 3)) == [110.0]


def test_the_opposite_side_is_never_counted():
    # A top at 115 is beyond every low behind it numerically. The side filter is what stops those
    # from being counted as broken, and it is logic rather than decoration.
    assert prices(taken_levels(reaches(100.0, 110.0, 101.0, 115.0), 3)) == [110.0]


def test_a_low_breaks_the_standing_lows_below_it():
    # The vertical mirror of the two rules at once, read once so the table cannot drift from the
    # branch it feeds. The 100 was taken out by the 99 and is no longer a level; the 99 is
    # standing, sits below the leg's open at 112 and above its close at 95, and is broken.
    assert prices(taken_levels(reaches(100.0, 110.0, 99.0, 112.0, 95.0), 4)) == [99.0]


def test_a_level_already_taken_out_is_not_broken_again():
    # The close at 95 is below all three lows behind it, and only two of them are levels: the 100
    # was taken out by the 96 long before this leg ran, so the line from it to here goes through
    # the leg that broke it. 96 and 98 are both still standing.
    assert prices(taken_levels(reaches(100.0, 110.0, 96.0, 112.0, 98.0, 114.0, 95.0), 6)) == [
        96.0,
        98.0,
    ]


def test_a_level_the_leg_began_beyond_was_never_crossed():
    # The rule that ends the counts in the dozens. The leg runs from a low at 190 to a high at
    # 210; the top at 100 is below where it *started*, so the leg did not run through it — it
    # was already a hundred points past it when it opened.
    assert taken_levels(reaches(95.0, 100.0, 190.0, 210.0), 3) == []


def test_a_level_exactly_at_the_leg_open_is_not_crossed():
    # The lower bound is strict for the same reason the upper one is: the leg *began* there.
    assert taken_levels(reaches(95.0, 110.0, 110.0, 120.0), 3) == []


def test_a_standing_level_inside_the_span_is_broken():
    # The same three prices as above with the top moved a tick inside the span, so the one test
    # that separates the two is the one being read.
    assert prices(taken_levels(reaches(95.0, 110.01, 110.0, 120.0), 3)) == [110.01]


# --- the adapter ------------------------------------------------------------------------


def chain(bars: BaseSeries[Candle]) -> tuple[dict, LegBreaksPattern]:
    """The real pipeline up to and including this Pattern, run over `bars`.

    Returns the `ctx` it filled plus the Pattern a test needs to key into it — `test_advancing_legs`
    's helper and for its reason: a test comparing this Series against the ones it joined needs
    both.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    simple_legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")
    nested = NestedLegsPattern(source=leg_windows, legs=simple_legs, reads=("5m",), emits="5m")
    zigzag_reach = LegReachPattern(source=zigzag, reads=("5m",), emits="5m")
    measures = RetracementPattern(source=zigzag_reach, reads=("5m",), emits="5m")
    breaks = LegBreaksPattern(
        source=nested, reaches=zigzag_reach, measures=measures, reads=("5m",), emits="5m"
    )

    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    for pattern in (
        zigzag,
        simple_leg,
        leg_windows,
        simple_legs,
        nested,
        zigzag_reach,
        measures,
        breaks,
    ):
        ctx[pattern.producer] = pattern.run(ctx)

    return ctx, breaks


def test_the_producer_key_names_the_whole_chain():
    _, breaks = chain(wave())

    assert breaks.producer.startswith("leg-breaks(source=<nested-legs(")
    assert "reaches=<leg-reach(source=<zig-zag(depth=8" in breaks.producer
    assert "measures=<retracement(source=<leg-reach(" in breaks.producer


def test_the_series_carries_the_identity_of_this_run():
    ctx, breaks = chain(wave())
    series: BaseSeries[LegBreak] = ctx[breaks.producer]

    assert series.identity == SeriesIdentity(breaks.producer, "WIN@N", "5m")


def test_one_point_per_group():
    ctx, breaks = chain(wave())

    assert len(ctx[breaks.producer]) == len(ctx[breaks.source.producer])


def test_each_point_is_anchored_where_its_leg_reached_its_close():
    ctx, breaks = chain(wave())
    reached = ctx[breaks.reaches.producer]

    # The anchor rule, and the alignment the join rests on, read back off the output: point `i`
    # sits on reach `i + 1`, never on the group's own opening vertex.
    for index, point in enumerate(ctx[breaks.producer]):
        assert point.time == reached[index + 1].time
        assert point.price == reached[index + 1].price
        assert point.direction == reached[index + 1].direction


def test_the_count_and_the_levels_agree():
    ctx, breaks = chain(wave())

    for point in ctx[breaks.producer]:
        assert point.broke == len(point.taken)


def test_the_broken_levels_are_bare_pivots():
    ctx, breaks = chain(wave(drift=0.2))
    taken = [level for point in ctx[breaks.producer] for level in point.taken]

    assert taken, "the wave should break something, or this asserts nothing"
    # Normalised on the way out: a level carries a bar and a price and makes no claim about the
    # Series it came from.
    assert all(not hasattr(level, "provisional") for level in taken)


def test_the_leg_count_is_the_groups_own():
    ctx, breaks = chain(wave())
    groups = ctx[breaks.source.producer]

    assert [point.legs for point in ctx[breaks.producer]] == [
        len(group.inside) for group in groups
    ]


def test_the_ratio_is_the_retracements_own():
    ctx, breaks = chain(wave())
    measured = ctx[breaks.measures.producer]

    assert [point.ratio for point in ctx[breaks.producer]] == [
        point.measured.ratio if point.measured else None for point in measured
    ]


def test_every_ratio_is_a_fraction_or_absent():
    ctx, breaks = chain(wave())

    for point in ctx[breaks.producer]:
        assert point.ratio is None or 0.0 <= point.ratio <= 1.0


def test_only_the_last_point_is_provisional():
    ctx, breaks = chain(wave())
    flags = [point.provisional for point in ctx[breaks.producer]]

    assert flags[-1] is True
    assert not any(flags[:-1])


def test_no_groups_yields_an_empty_series():
    # Three distinct sources, so the three `ctx` keys are three keys. All three empty, which is
    # what a run over no bars looks like: the length rule does not apply and must not fire.
    breaks = LegBreaksPattern(
        source=ZigZagPattern(depth=1, reads=("5m",), emits="5m"),
        reaches=ZigZagPattern(depth=2, reads=("5m",), emits="5m"),
        measures=ZigZagPattern(depth=3, reads=("5m",), emits="5m"),
        reads=("5m",),
        emits="5m",
    )
    ctx = {INSTRUMENT: "WIN@N"}
    for source in (breaks.source, breaks.reaches, breaks.measures):
        ctx[source.producer] = BaseSeries(SeriesIdentity(source.producer, "WIN@N", "5m"), [])

    assert list(breaks.run(ctx)) == []


def test_series_of_unalignable_lengths_raise():
    ctx, breaks = chain(wave())
    # The reaches replaced by an empty Series: this is what pointing `reaches` at a different
    # detector looks like from in here, and it must not be read as "a run with no breaks".
    ctx[breaks.reaches.producer] = BaseSeries(
        SeriesIdentity(breaks.reaches.producer, "WIN@N", "5m"), []
    )

    with pytest.raises(ValueError, match="unalignable lengths"):
        breaks.run(ctx)


def test_measurements_that_do_not_measure_these_legs_raise():
    ctx, breaks = chain(wave())
    groups = ctx[breaks.source.producer]
    bars = wave()
    # The right *number* of measurements, anchored on the wrong bars — the failure the length
    # check cannot see and the per-entry anchor comparison exists for.
    ctx[breaks.measures.producer] = BaseSeries(
        SeriesIdentity(breaks.measures.producer, "WIN@N", "5m"),
        [
            type(ctx[breaks.measures.producer][0]).anchored(
                bars[index],
                price=bars[index].close,
                direction="high",
                measured=None,
                provisional=False,
            )
            for index in range(len(groups))
        ],
    )

    with pytest.raises(ValueError, match="does not measure the legs of"):
        breaks.run(ctx)


# --- end to end ------------------------------------------------------------------------


def test_a_wave_that_repeats_its_tops_exactly_breaks_nothing():
    # The strict comparison, read off the real chain rather than off hand-built prices: an
    # undrifted wave tops out on the same price every time, and every one of those is a retest.
    ctx, breaks = chain(wave())
    points = list(ctx[breaks.producer])

    assert points, "the chain should find legs, or this asserts nothing"
    assert all(point.broke == 0 for point in points)


def test_a_rising_wave_breaks_exactly_one_top_per_top():
    # The standing rule read off the real chain. Each top clears the one before it — and in doing
    # so *removes* it, so the next leg finds exactly one level standing in front of it however far
    # the wave has run. Under the old rule this count climbed with the window; that it no longer
    # does is the whole of this change.
    ctx, breaks = chain(wave(drift=0.2))
    highs = [point.broke for point in ctx[breaks.producer] if point.direction == "high"]

    assert highs, "the chain should find tops, or this asserts nothing"
    assert set(highs[1:]) == {1}


def test_no_level_is_broken_from_outside_the_legs_own_span():
    # Both price rules, asserted over every Point of a real run rather than over hand-built
    # prices: a broken level sits strictly inside the leg that broke it.
    ctx, breaks = chain(wave(drift=0.2))
    reached = ctx[breaks.reaches.producer]

    for index, point in enumerate(ctx[breaks.producer]):
        opened = reached[index].price
        for level in point.taken:
            low, high = sorted((opened, point.price))
            assert low < level.price < high
