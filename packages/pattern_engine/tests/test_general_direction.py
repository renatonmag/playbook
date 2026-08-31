"""Tests for `general-direction` — the rule first, then the adapter over it.

The rule tests speak in hand-built `LegMark`/`ZigZagPivot` lists, because a detector cannot be
asked for a specific breakout. The adapter tests assert what the Pattern promises on top: the
provisional mark never reaches the rule, the Points sit on the deciding marks' bars, and the
identity names the run. One test at the bottom drives the real two-detector chain.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.general_direction import (
    GeneralDirection,
    GeneralDirectionPattern,
    general_direction,
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


def opening(side: Side = "low", price: float = 90.0) -> LegMark:
    """The start of the first simple leg: a mark, but not an inflexion, so the rule drops it.

    One bar before `OPEN`, which keeps every fixture's own indices — and the times they order by
    — exactly as they read. Its side and price are arbitrary precisely because it is dropped.
    """
    return mark(-1, side, price)


#: A bearish seed with a first breakout already in: descending highs 110 → 108 agree at index 2,
#: the high at index 6 takes out the previous high (105) for breakout one, and the running
#: maximum since the seed stands at 108. What happens next is each test's business.
BEAR_SEED_ONE_CRACK = [
    opening(),
    mark(0, "high", 110.0),
    mark(1, "low", 100.0),
    mark(2, "high", 108.0),
    mark(3, "low", 98.0),
    mark(4, "high", 105.0),
    mark(5, "low", 96.0),
    mark(6, "high", 106.0),
]


# --- the seed ---------------------------------------------------------------------------


def test_descending_highs_seed_bearish_at_the_second_high():
    events = general_direction([opening(), mark(0, "high", 110.0), mark(1, "low", 100.0),
                                mark(2, "high", 108.0)], [])
    assert [(m.time, d, k) for m, d, k in events] == [(bar(2, 108.0).time, "bearish", "seed")]


def test_ascending_lows_seed_bullish_at_the_second_low():
    events = general_direction([opening(), mark(0, "low", 100.0), mark(1, "high", 110.0),
                                mark(2, "low", 102.0)], [])
    assert [(d, k) for _, d, k in events] == [("bullish", "seed")]


def test_equal_prices_do_not_agree():
    """A retested level is a level held, not a slope — the later ascending lows win instead."""
    events = general_direction(
        [opening(), mark(0, "high", 110.0), mark(1, "low", 100.0), mark(2, "high", 110.0),
         mark(3, "low", 101.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events] == [(bar(3, 101.0).time, "bullish", "seed")]


def test_no_agreeing_pair_emits_nothing():
    assert general_direction([], []) == []
    assert general_direction([opening(), mark(0, "high", 110.0)], []) == []
    assert general_direction([opening(), mark(0, "high", 110.0), mark(1, "low", 100.0)], []) == []


def test_consecutive_same_side_marks_compare_against_each_other():
    # The merged-mark shape: `simple-leg` normally alternates, but two marks can collapse onto
    # one bar and leave the series with neighbours on one side. They are still a pair.
    events = general_direction([opening(), mark(0, "high", 110.0), mark(1, "high", 108.0)], [])
    assert [(d, k) for _, d, k in events] == [("bearish", "seed")]


# --- the opening mark -------------------------------------------------------------------


def test_the_first_mark_is_the_start_of_the_first_leg_not_an_inflexion():
    """Three marks that would seed bearish if the first one counted. It does not.

    The window opens mid-leg, so the turn that would have marked the first leg's *start* is not
    in the window to be read — the mark that is there opens the leg rather than ending one. With
    it dropped, one high is left and there is nothing to pair it with.
    """
    marks = [mark(0, "high", 110.0), mark(1, "low", 100.0), mark(2, "high", 108.0)]
    assert general_direction(marks, []) == []


def test_the_opening_mark_cannot_complete_a_pair():
    """The ascending lows need the dropped mark, so the descending highs seed instead."""
    events = general_direction(
        [mark(0, "low", 100.0), mark(1, "low", 102.0), mark(2, "high", 110.0),
         mark(3, "high", 108.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events] == [(bar(3, 108.0).time, "bearish", "seed")]


def test_the_opening_mark_s_price_and_side_change_nothing():
    """It is dropped, so nothing about it can be read — asserted rather than assumed."""
    rest = [mark(0, "high", 110.0), mark(1, "low", 100.0), mark(2, "high", 108.0)]
    low_open = general_direction([opening("low", 90.0), *rest], [])
    high_open = general_direction([opening("high", 999.0), *rest], [])
    assert [(m.time, d, k) for m, d, k in low_open] == [(m.time, d, k) for m, d, k in high_open]
    assert [(d, k) for _, d, k in low_open] == [("bearish", "seed")]


# --- the two breakouts ------------------------------------------------------------------


def test_one_breakout_does_not_flip():
    events = general_direction(BEAR_SEED_ONE_CRACK, [])
    assert [(d, k) for _, d, k in events] == [("bearish", "seed")]


def test_the_second_breakout_clears_the_first_breakout_s_high():
    # The first breakout put the level at 106; 107 clears it, and that is the whole test.
    events = general_direction([*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0),
                                mark(8, "high", 107.0)], [])
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(8, 107.0).time, "bullish", "flip")


def test_a_high_below_the_first_breakout_does_not_flip():
    events = general_direction([*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0),
                                mark(8, "high", 105.5)], [])
    assert [(d, k) for _, d, k in events] == [("bearish", "seed")]


def test_the_seed_pivot_is_not_a_ceiling():
    """The level is where the break began, never how far the old move ran.

    `BEAR_SEED_ONE_CRACK` seeds on a high of 108 and cracks at 106, so 107 is above the level and
    below the seed. It flips. Reading the seed pivot as a ceiling held real sessions bearish for
    hours after the structure had plainly turned.
    """
    events = general_direction([*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0),
                                mark(8, "high", 107.0)], [])
    assert [(d, k) for _, d, k in events] == [("bearish", "seed"), ("bullish", "flip")]
    seed = next(m for m, _, k in events if k == "seed")
    assert seed.price == 108.0 > 107.0


def test_a_failed_second_breakout_leaves_the_level_where_it_was():
    """A failure does not raise the bar for the next attempt — 107 still only has to clear 106."""
    events = general_direction(
        [*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0), mark(8, "high", 105.5),
         mark(9, "low", 96.5), mark(10, "high", 107.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(10, 107.0).time, "bullish", "flip")


def test_a_high_above_the_level_flips_to_bullish_at_that_mark():
    events = general_direction([*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0),
                                mark(8, "high", 109.0)], [])
    assert [(m.time, d, k) for m, d, k in events] == [
        (bar(2, 108.0).time, "bearish", "seed"),
        (bar(8, 109.0).time, "bullish", "flip"),
    ]


def test_a_failed_high_between_the_two_breakouts_does_not_clear_the_breakout():
    # Index 6 cracked the structure; the lower high at 8 repairs nothing by itself, and the
    # high at 10 only has to clear the level that crack set.
    events = general_direction(
        [*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0), mark(8, "high", 104.0),
         mark(9, "low", 96.5), mark(10, "high", 109.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(10, 109.0).time, "bullish", "flip")


def test_bullish_to_bearish_is_the_vertical_mirror():
    events = general_direction(
        [opening(), mark(0, "low", 100.0), mark(1, "high", 110.0), mark(2, "low", 102.0),
         mark(3, "high", 108.0), mark(4, "low", 101.0), mark(5, "high", 107.0),
         mark(6, "low", 99.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events] == [
        (bar(2, 102.0).time, "bullish", "seed"),
        (bar(6, 99.0).time, "bearish", "flip"),
    ]


# --- the guard --------------------------------------------------------------------------

#: A bearish seed whose first breakout (109 over 108, at index 4) lands with a zigzag low pivot
#: at 97 already on the board — the guard the tests below press on.
BEAR_GUARDED = [
    opening(),
    mark(0, "high", 110.0),
    mark(1, "low", 100.0),
    mark(2, "high", 108.0),
    mark(3, "low", 97.0),
    mark(4, "high", 109.0),
]
GUARD_PIVOT = [pivot(3, "low", 97.0)]


def test_a_low_past_the_guard_repairs_the_first_breakout():
    # The low at index 5 prints below the guarded leg low (97), so the level goes with it: the
    # high at 6 is only breakout one again, and the flip has to wait for the high at 8.
    events = general_direction(
        [*BEAR_GUARDED, mark(5, "low", 94.0), mark(6, "high", 111.0),
         mark(7, "low", 98.0), mark(8, "high", 112.0)],
        GUARD_PIVOT,
    )
    assert [(m.time, d, k) for m, d, k in events] == [
        (bar(2, 108.0).time, "bearish", "seed"),
        (bar(8, 112.0).time, "bullish", "flip"),
    ]


def test_a_low_at_or_above_the_guard_repairs_nothing():
    # Same shape, but the low at 5 holds above the guard — the crack stands, and the high at 6
    # clears its level (109) for the flip.
    events = general_direction(
        [*BEAR_GUARDED, mark(5, "low", 98.0), mark(6, "high", 111.0)],
        GUARD_PIVOT,
    )
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(6, 111.0).time, "bullish", "flip")


def test_no_zigzag_pivot_means_no_guard_and_no_repair():
    events = general_direction(
        [*BEAR_GUARDED, mark(5, "low", 94.0), mark(6, "high", 111.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(6, 111.0).time, "bullish", "flip")


# --- after a flip -----------------------------------------------------------------------

#: The bearish run flipped bullish at index 8; the last low of the old trend sits at 97.
BULL_AFTER_FLIP = [*BEAR_SEED_ONE_CRACK, mark(7, "low", 97.0), mark(8, "high", 109.0)]


def test_one_breakout_after_a_flip_does_not_flip_back():
    # 95 takes out the old trend's last low (97) — breakout one of the new bullish trend, judged
    # chronologically across the boundary — and nothing more happens.
    events = general_direction([*BULL_AFTER_FLIP, mark(9, "low", 95.0)], [])
    assert [(d, k) for _, d, k in events] == [("bearish", "seed"), ("bullish", "flip")]


def test_the_level_is_cleared_at_a_flip():
    # The new bullish trend starts with no level; the low at 9 sets one at 95, and the low at 11
    # clears it for the flip back. The old trend's levels are not in the way.
    events = general_direction(
        [*BULL_AFTER_FLIP, mark(9, "low", 95.0), mark(10, "high", 108.0),
         mark(11, "low", 93.0)],
        [],
    )
    assert [(m.time, d, k) for m, d, k in events][-1] == (bar(11, 93.0).time, "bearish", "flip")


# --- the adapter ------------------------------------------------------------------------


def sources() -> tuple[SimpleLegPattern, ZigZagPattern]:
    return (
        SimpleLegPattern(reads=("5m",), emits="5m"),
        ZigZagPattern(depth=8, reads=("5m",), emits="5m"),
    )


def run(marks: list[LegMark], pivots: list[ZigZagPivot]) -> BaseSeries[GeneralDirection]:
    simple, zigzag = sources()
    pattern = GeneralDirectionPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")
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
    pattern = GeneralDirectionPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")
    assert pattern.producer == (
        "general-direction(source=<simple-leg(reads=5m,emits=5m)>,"
        "pivots=<zig-zag(depth=8,reads=5m,emits=5m)>,reads=5m,emits=5m)"
    )


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run(BEAR_SEED_ONE_CRACK, [])
    assert series.identity.producer.startswith("general-direction(")
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"


def test_each_point_sits_on_the_deciding_mark_s_bar_with_its_price():
    series = run(BULL_AFTER_FLIP, [])
    by_time = {m.time: m for m in BULL_AFTER_FLIP}
    assert len(series) == 2
    for point in series:
        deciding = by_time[point.time]
        assert point.price == deciding.price
        assert (point.open, point.high, point.low, point.close, point.volume) == (
            deciding.open, deciding.high, deciding.low, deciding.close, deciding.volume
        )
    assert [(p.direction, p.kind) for p in series] == [("bearish", "seed"), ("bullish", "flip")]


def test_a_provisional_mark_never_reaches_the_rule():
    # Settled, this last mark completes the bearish seed; provisional, it is the running leg's
    # moving endpoint and the adapter drops it before the rule looks. Both halves asserted, so
    # the test cannot pass for the wrong reason — an empty answer is what the whole fixture
    # gives if anything upstream of the flag goes wrong.
    head = [opening(), mark(0, "high", 110.0), mark(1, "low", 100.0)]
    assert [(p.direction, p.kind) for p in run([*head, mark(2, "high", 108.0)], [])] == [
        ("bearish", "seed")
    ]
    assert len(run([*head, mark(2, "high", 108.0, provisional=True)], [])) == 0


def test_the_real_chain_seeds_a_bearish_trend_on_a_falling_wave():
    """Drive the two detectors for real: a triangular wave drifting down makes descending highs."""
    bars = []
    for i in range(60):
        phase = i % 12
        rising = phase < 6
        offset = phase if rising else 12 - phase
        mid = 100.0 + 8.0 * offset / 6 - 0.2 * i
        bars.append(Candle(time=OPEN + timedelta(minutes=5 * i), open=mid, high=mid + 0.5,
                           low=mid - 0.5, close=mid, volume=100.0))
    window = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)

    simple, zigzag = sources()
    ctx = {BARS: {"5m": window}, INSTRUMENT: "WIN@N"}
    ctx[simple.producer] = simple.run(ctx)
    ctx[zigzag.producer] = zigzag.run(ctx)
    pattern = GeneralDirectionPattern(source=simple, pivots=zigzag, reads=("5m",), emits="5m")
    series = pattern.run(ctx)

    assert len(series) >= 1
    assert (series[0].direction, series[0].kind) == ("bearish", "seed")
    assert all(point.kind == "flip" for point in list(series)[1:])
    times = [point.time for point in series]
    assert times == sorted(times)
    # The opening mark is not an inflexion, so no turn can be read on it — the seed is at the
    # second inflexion at the earliest, which puts it past the Series' first two marks.
    marks = list(ctx[simple.producer])
    assert series[0].time > marks[0].time
