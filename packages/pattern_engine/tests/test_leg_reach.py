"""Tests for the rule that reprices a detector's pivots at the extremes their legs reached, and
the Pattern that publishes them.

Two layers, tested apart, the way `test_trend_lines.py` and `test_retracement.py` do it:
`leg_reaches` is handed Candles and pivots built by hand, and the adapter is driven directly and
then through the real `SimpleLegPattern` it exists to correct.

Every fixture is a **top** story — a leg that ran up and was marked late — and mirrored to the
bottom side by `flipped`, which turns every bar upside down and swaps every pivot's side. A bottom
is the vertical mirror of a top, which is exactly the claim the rule makes by branching on
`direction`, and a mirrored fixture is how that claim gets tested rather than retyped.

`bar` names a bar by both extremes, unlike the builders in `test_trend_lines.py`: this rule reads
the watched side of *every* bar in a span, so there is no unwatched side to push out of the way.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_reach import LegReach, LegReachPattern, leg_reaches
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def at(index: int) -> datetime:
    return OPEN + timedelta(minutes=5 * index)


def bar(index: int, low: float, high: float) -> Candle:
    """One bar named by both its extremes, with its body in the middle of them."""
    mid = (low + high) / 2
    return Candle(time=at(index), open=mid, high=high, low=low, close=mid, volume=1.0)


def mark(index: int, side: str, price: float) -> LegMark:
    """A settled `simple-leg` mark on bar `index`.

    Its own `price` is set faithfully so a fixture reads by eye, and the rule under test never
    looks at it: what a pivot contributes is its bar and its side, and the price comes from the
    bars of the leg behind it. That is the whole finding this module is built on.
    """
    return LegMark(
        time=at(index), open=price, high=price, low=price, close=price, volume=1.0,
        price=price, direction=side, provisional=False,  # type: ignore[arg-type]
    )


def vertex(index: int, side: str, price: float) -> ZigZagPivot:
    """The same pivot as the zigzag would emit it — the other member of `SidedPivot`."""
    return ZigZagPivot(
        time=at(index), open=price, high=price, low=price, close=price, volume=1.0,
        price=price, direction=side, since=None,  # type: ignore[arg-type]
    )


def flipped_bar(candle: Candle) -> Candle:
    """The same bar upside down: what was a low is a high."""
    return Candle(
        time=candle.time, open=-candle.open, high=-candle.low, low=-candle.high,
        close=-candle.close, volume=candle.volume,
    )


def flipped_mark(point: LegMark) -> LegMark:
    return LegMark(
        time=point.time, open=-point.open, high=-point.low, low=-point.high, close=-point.close,
        volume=point.volume, price=-point.price,
        direction="high" if point.direction == "low" else "low",
        provisional=point.provisional,
    )


def flipped(
    case: tuple[list[Candle], list[LegMark]],
) -> tuple[list[Candle], list[LegMark]]:
    """A top fixture as the bottom fixture it mirrors."""
    bars, pivots = case
    return ([flipped_bar(b) for b in bars], [flipped_mark(m) for m in pivots])


#: A leg that topped at bar 1 and was only marked at bar 3, the shape the whole module is for.
LATE = (
    [bar(0, 100.0, 101.0), bar(1, 101.0, 105.0), bar(2, 100.0, 103.0), bar(3, 99.0, 102.0)],
    [mark(0, "low", 100.0), mark(3, "high", 102.0)],
)


# --- the rule ---------------------------------------------------------------------------------


@pytest.mark.parametrize("sign, case", [(1, LATE), (-1, flipped(LATE))])
def test_a_pivot_marked_after_its_leg_topped_is_repriced_at_the_top(sign, case):
    """The finding itself: the mark says 102 on bar 3, and the leg actually reached 105 on bar 1."""
    bars, pivots = case
    assert leg_reaches(bars, pivots) == [(0, sign * 100.0), (1, sign * 105.0)]


def test_the_earliest_bar_to_reach_the_level_keeps_it():
    bars = [bar(0, 99.0, 100.0), bar(1, 100.0, 105.0), bar(2, 100.0, 105.0)]
    assert leg_reaches(bars, [mark(0, "low", 99.0), mark(2, "high", 105.0)])[1] == (1, 105.0)


def test_the_first_pivot_takes_the_window_head_rather_than_a_leg_of_its_own():
    """Its leg opened before the window, so its reach is the best of what the window shows."""
    bars = [bar(0, 90.0, 95.0), bar(1, 95.0, 99.0), bar(2, 96.0, 100.0)]
    assert leg_reaches(bars, [mark(2, "low", 96.0)]) == [(0, 90.0)]


def test_there_is_one_answer_per_pivot_in_the_sources_own_order():
    bars, pivots = LATE
    assert len(leg_reaches(bars, pivots)) == len(pivots)


def test_the_positions_never_go_backwards_so_the_series_stays_orderable():
    bars = [bar(i, 100.0 - i, 110.0 - i) for i in range(10)]
    pivots = [mark(0, "high", 110.0), mark(4, "low", 96.0), mark(7, "high", 103.0),
              mark(9, "low", 91.0)]
    positions = [position for position, _ in leg_reaches(bars, pivots)]
    assert positions == sorted(positions)


def test_a_top_is_never_repriced_below_the_bottom_that_follows_it():
    """The legs share their boundary bar, so the scan cannot make two pivots cross."""
    bars = [bar(0, 98.0, 99.0), bar(1, 100.0, 108.0), bar(2, 97.0, 104.0), bar(3, 92.0, 96.0)]
    reaches = leg_reaches(bars, [mark(1, "high", 108.0), mark(3, "low", 92.0)])
    assert reaches[0][1] > reaches[1][1]


def test_two_legs_can_reach_their_extreme_on_one_bar():
    """An outside bar that both closed the leg into it and opened the one out of it."""
    bars = [bar(0, 99.0, 100.0), bar(1, 100.0, 104.0), bar(2, 90.0, 110.0),
            bar(3, 95.0, 99.0), bar(4, 94.0, 98.0)]
    reaches = leg_reaches(bars, [mark(2, "high", 110.0), mark(4, "low", 94.0)])
    assert [position for position, _ in reaches] == [2, 2]


def test_two_pivots_on_one_side_in_a_row_are_each_scanned_rather_than_skipped():
    """Neither detector guarantees alternation, and this rule needs none — it reads one side."""
    bars = [bar(0, 99.0, 100.0), bar(1, 100.0, 107.0), bar(2, 101.0, 103.0), bar(3, 102.0, 109.0)]
    assert leg_reaches(bars, [mark(1, "high", 107.0), mark(3, "high", 109.0)]) == [
        (1, 107.0),
        (3, 109.0),
    ]


def test_a_zigzag_vertex_is_measured_by_the_very_same_call():
    """`SidedPivot` is a union and not a second code path: only `time` and `direction` are read."""
    bars, _ = LATE
    assert leg_reaches(bars, [vertex(0, "low", 100.0), vertex(3, "high", 102.0)]) == [
        (0, 100.0),
        (1, 105.0),
    ]


def test_a_pivot_sitting_on_no_bar_of_the_window_raises():
    """The mismatched-Timeframe guard, borrowed from `position_of` rather than rewritten."""
    bars, _ = LATE
    with pytest.raises(ValueError, match="different Timeframes"):
        leg_reaches(bars, [mark(9, "high", 102.0)])


# --- the adapter ------------------------------------------------------------------------------


def detector() -> SimpleLegPattern:
    """A source built for its `producer` and `name` alone. `test_leg_extremes`' trick."""
    return SimpleLegPattern(reads=("5m",), emits="5m")


def run(bars: list[Candle], pivots: list[LegMark], source=None) -> BaseSeries:
    source = source or detector()
    pattern = LegReachPattern(source=source, reads=("5m",), emits="5m")
    return pattern.run(
        {
            BARS: {"5m": BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)},
            INSTRUMENT: "WIN@N",
            source.producer: BaseSeries(SeriesIdentity(source.producer, "WIN@N", "5m"), pivots),
        }
    )


def test_each_point_is_anchored_on_the_bar_the_leg_reached_and_not_on_the_pivots():
    bars, pivots = LATE
    series = run(bars, pivots)
    assert [point.time for point in series] == [at(0), at(1)]
    assert [pivot.time for pivot in pivots] == [at(0), at(3)]


def test_each_point_carries_the_reached_price_and_the_pivots_own_side():
    bars, pivots = LATE
    series = run(bars, pivots)
    assert [(point.price, point.direction) for point in series] == [(100.0, "low"), (105.0, "high")]


def test_the_point_carries_the_reached_bars_own_ohlcv():
    bars, pivots = LATE
    top = run(bars, pivots)[1]
    assert (top.open, top.high, top.low, top.close, top.volume) == (
        bars[1].open, bars[1].high, bars[1].low, bars[1].close, bars[1].volume
    )


def test_there_is_one_point_per_source_pivot():
    bars, pivots = LATE
    assert len(run(bars, pivots)) == len(pivots)


def test_the_last_point_is_flagged_provisional():
    bars, pivots = LATE
    assert [point.provisional for point in run(bars, pivots)] == [False, True]


def test_a_settled_final_mark_is_flagged_too_which_is_the_conservative_half_of_that_rule():
    """Positional, so one rule serves both detectors — and over-reports on a settled last mark."""
    bars, pivots = LATE
    assert all(not pivot.provisional for pivot in pivots)
    assert run(bars, pivots)[-1].provisional


def test_the_series_identity_names_this_pattern_and_the_ctx_instrument():
    bars, pivots = LATE
    source = detector()
    series = run(bars, pivots, source)
    pattern = LegReachPattern(source=source, reads=("5m",), emits="5m")
    assert series.identity.producer == pattern.producer
    assert (series.identity.instrument, series.identity.timeframe) == ("WIN@N", "5m")


def test_the_two_instances_share_neither_a_key_nor_a_label():
    over_zigzag = LegReachPattern(
        source=ZigZagPattern(depth=8, reads=("5m",), emits="5m"), reads=("5m",), emits="5m"
    )
    over_marks = LegReachPattern(source=detector(), reads=("5m",), emits="5m")
    assert over_zigzag.producer != over_marks.producer
    assert (over_zigzag.name, over_marks.name) == ("Reach · Zig-zag", "Reach · Simple leg")


def test_the_real_chain_moves_a_simple_leg_mark_back_onto_the_top_it_missed():
    """Drive the detector for real: a rise that stalls on rising lows before it finally turns.

    `simple-leg` turns a bull leg on a *lower low* and never looks at the highs, so bars 3 and 4
    keep the leg alive after the top at bar 2 and the mark lands on bar 4. That is the gap this
    Pattern closes, and here it is closed against the real rule rather than against a fixture.
    """
    prices = [
        (100.0, 101.0), (101.0, 103.0), (103.0, 108.0), (104.0, 106.0), (104.5, 105.0),
        (100.0, 104.0), (97.0, 100.0), (95.0, 98.0), (96.0, 99.0),
    ]
    bars = [bar(index, low, high) for index, (low, high) in enumerate(prices)]
    window = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)

    source = detector()
    ctx = {BARS: {"5m": window}, INSTRUMENT: "WIN@N"}
    ctx[source.producer] = source.run(ctx)
    series = LegReachPattern(source=source, reads=("5m",), emits="5m").run(ctx)

    marks = list(ctx[source.producer])
    assert len(series) == len(marks)
    # The mark for the first leg sits at bar 4 and prices the top at 105; the top was 108 at bar 2.
    assert (marks[0].time, marks[0].price) == (at(4), 105.0)
    assert (series[0].time, series[0].price) == (at(2), 108.0)
    assert isinstance(series[0], LegReach)
    # And nothing moved the wrong way: a top only rises, a bottom only falls.
    for point, source_pivot in zip(series, marks):
        if point.direction == "high":
            assert point.price >= source_pivot.price
        else:
            assert point.price <= source_pivot.price
