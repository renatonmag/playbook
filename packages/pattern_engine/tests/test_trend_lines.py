"""Tests for the trend lines drawn between simple-leg pivots, and the Pattern that reports them.

Two layers, tested apart, the way `test_bar_gap.py` and `test_general_direction.py` do it: `clear`
and `trend_lines` are handed Candles and `LegMark`s built by hand, and the adapter is driven both
directly and through a real `PatternEngine`.

Every fixture here is a **bottom** story — a floor drawn along the lows — and mirrored to the top
side by `flipped`, which negates every price and swaps every mark's side. A ceiling is the vertical
mirror of a floor, which is exactly the claim the rule makes by branching on `direction`, and a
mirrored fixture is how that claim gets tested honestly rather than retyped.

The bar builders below give every bar a wide range on the *unwatched* side, so a bottom fixture can
never accidentally be blocked by a high nobody is looking at. That is deliberate: it keeps each
test about the one comparison it names.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.trend_lines import (
    TrendLine,
    TrendLinesPattern,
    clear,
    trend_lines,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: How far a bar's unwatched extreme is pushed away from its watched one. Large enough that no
#: fixture's highs can ever block a line drawn along its lows, or the other way round.
CLEARANCE = 1000.0


def at(index: int) -> datetime:
    return OPEN + timedelta(minutes=5 * index)


def bar(index: int, low: float, high: float | None = None) -> Candle:
    """One bar, named by its `low` and given a high far out of the way unless one is asked for."""
    top = low + CLEARANCE if high is None else high
    return Candle(
        time=at(index), open=low, high=top, low=low, close=low, volume=1.0
    )


def mark(index: int, side: str, price: float) -> LegMark:
    """A settled `simple-leg` mark on bar `index`, at `price` on the named side."""
    return LegMark(
        time=at(index),
        open=price,
        high=price + CLEARANCE,
        low=price,
        close=price,
        volume=1.0,
        price=price,
        direction=side,  # type: ignore[arg-type]
        provisional=False,
    )


def flipped_bar(candle: Candle) -> Candle:
    """The same bar upside down: what was a low is a high, and the clearance points the other way."""
    return Candle(
        time=candle.time,
        open=-candle.open,
        high=-candle.low,
        low=-candle.high,
        close=-candle.close,
        volume=candle.volume,
    )


def flipped_mark(point: LegMark) -> LegMark:
    return LegMark(
        time=point.time,
        open=-point.open,
        high=-point.low,
        low=-point.high,
        close=-point.close,
        volume=point.volume,
        price=-point.price,
        direction="high" if point.direction == "low" else "low",
        provisional=point.provisional,
    )


def flipped(
    case: tuple[list[Candle], list[LegMark]],
) -> tuple[list[Candle], list[LegMark]]:
    """A bottom fixture as the top fixture it mirrors."""
    bars, marks = case
    return ([flipped_bar(b) for b in bars], [flipped_mark(m) for m in marks])


def named(pairs: list[tuple[LegMark, LegMark]]) -> list[tuple[int, int]]:
    """Pairs as the bar indices they join, which is what every assertion below is about."""
    return [
        (
            round((a.time - OPEN).total_seconds() / 300),
            round((b.time - OPEN).total_seconds() / 300),
        )
        for a, b in pairs
    ]


# --- the collision test ---------------------------------------------------------------------


def test_a_low_above_the_line_leaves_it_clear():
    """Bar 1 sits at 105 where the line from (0, 100) to (2, 100) sits at 100."""
    bars = [bar(0, 100.0), bar(1, 105.0), bar(2, 100.0)]
    assert clear(bars, 0, 2, 100.0, 100.0, "low") is True


def test_a_low_below_the_line_blocks_it():
    bars = [bar(0, 100.0), bar(1, 99.0), bar(2, 100.0)]
    assert clear(bars, 0, 2, 100.0, 100.0, "low") is False


def test_a_low_exactly_on_the_line_keeps_it():
    """Touching is what a line is for. Strict comparison, so equality survives."""
    bars = [bar(0, 100.0), bar(1, 100.0), bar(2, 100.0)]
    assert clear(bars, 0, 2, 100.0, 100.0, "low") is True


def test_the_line_is_interpolated_and_not_flat():
    """Rising floor: the line sits at 101 on bar 1, so a low of 100.5 is under it after all."""
    bars = [bar(0, 100.0), bar(1, 100.5), bar(2, 102.0)]
    assert clear(bars, 0, 2, 100.0, 102.0, "low") is False
    # Half a point higher and it clears the same line.
    bars[1] = bar(1, 101.5)
    assert clear(bars, 0, 2, 100.0, 102.0, "low") is True


def test_a_sub_tick_dip_under_the_line_is_not_a_collision():
    """Both sides go through `integer`, so a rounding artefact is not a candle in the way."""
    bars = [bar(0, 100.0), bar(1, 100.0 - 1e-9), bar(2, 100.0)]
    assert clear(bars, 0, 2, 100.0, 100.0, "low") is True


def test_a_high_over_the_line_blocks_a_top_line():
    """The mirror comparison: for a ceiling it is the highs that reach through."""
    bars = [
        bar(0, 0.0, high=100.0),
        bar(1, 0.0, high=101.0),
        bar(2, 0.0, high=100.0),
    ]
    assert clear(bars, 0, 2, 100.0, 100.0, "high") is False
    bars[1] = bar(1, 0.0, high=99.0)
    assert clear(bars, 0, 2, 100.0, 100.0, "high") is True


# --- the pairing -----------------------------------------------------------------------------

#: Four bottoms on a rising floor at bars 0, 2, 4, 6, with nothing in between reaching under any
#: line they can be joined by. Every pair is therefore drawable — the full fan.
CLEAN: tuple[list[Candle], list[LegMark]] = (
    [
        bar(0, 100.0),
        bar(1, 120.0),
        bar(2, 102.0),
        bar(3, 122.0),
        bar(4, 104.0),
        bar(5, 124.0),
        bar(6, 106.0),
    ],
    [
        mark(0, "low", 100.0),
        mark(2, "low", 102.0),
        mark(4, "low", 104.0),
        mark(6, "low", 106.0),
    ],
)

#: The same four bottoms with bar 3 spiking down to 99 — under every line that spans it, since the
#: shallowest of those sits at 103 there. It severs the window in two: (0, 4), (0, 6), (2, 4) and
#: (2, 6) all cross bar 3 and die, leaving only the pairs wholly on one side of it.
BLOCKED: tuple[list[Candle], list[LegMark]] = (
    [
        bar(0, 100.0),
        bar(1, 120.0),
        bar(2, 102.0),
        bar(3, 99.0),
        bar(4, 104.0),
        bar(5, 124.0),
        bar(6, 106.0),
    ],
    CLEAN[1],
)

#: Bottoms at 0 and 4 with a top mark at 2 sitting *below* both of them. If sides were ignored the
#: top would be picked up as an endpoint and the two bottoms would look blocked by their own
#: neighbour; with sides respected, the bottoms connect and the lone top pairs with nothing.
MIXED: tuple[list[Candle], list[LegMark]] = (
    [bar(0, 100.0), bar(1, 120.0), bar(2, 101.0), bar(3, 120.0), bar(4, 102.0)],
    [mark(0, "low", 100.0), mark(2, "high", 50.0), mark(4, "low", 102.0)],
)


@pytest.mark.parametrize("case", [CLEAN, flipped(CLEAN)])
def test_every_reachable_pivot_is_connected_not_only_the_next_one(case):
    """The fan, not a chain: bar 0 reaches 4 and 6 as well as 2."""
    bars, marks = case
    assert named(trend_lines(bars, marks)) == [(0, 2), (0, 4), (0, 6), (2, 4), (2, 6), (4, 6)]


@pytest.mark.parametrize("case", [BLOCKED, flipped(BLOCKED)])
def test_a_candle_in_the_way_drops_that_connection_and_no_other(case):
    bars, marks = case
    assert named(trend_lines(bars, marks)) == [(0, 2), (4, 6)]


@pytest.mark.parametrize("case", [MIXED, flipped(MIXED)])
def test_only_marks_of_the_same_side_are_joined(case):
    bars, marks = case
    assert named(trend_lines(bars, marks)) == [(0, 4)]


def test_adjacent_marks_make_no_line():
    """Nothing between them for a candle to block, so the pair is true and says nothing."""
    bars = [bar(0, 100.0), bar(1, 101.0)]
    marks = [mark(0, "low", 100.0), mark(1, "low", 101.0)]
    assert trend_lines(bars, marks) == []


def test_two_marks_merged_onto_one_bar_make_no_line():
    bars = [bar(0, 100.0), bar(1, 101.0)]
    marks = [mark(0, "low", 100.0), mark(0, "high", 100.0 + CLEARANCE)]
    assert trend_lines(bars, marks) == []


def test_no_marks_is_no_lines():
    assert trend_lines([bar(0, 100.0), bar(1, 101.0)], []) == []


def test_a_mark_off_the_window_raises():
    """The shared mismatched-Timeframe guard, reached through `position_of`."""
    with pytest.raises(ValueError, match="different Timeframes"):
        trend_lines([bar(0, 100.0)], [mark(0, "low", 100.0), mark(9, "low", 101.0)])


# --- the adapter -----------------------------------------------------------------------------


def source() -> SimpleLegPattern:
    return SimpleLegPattern(reads=("5m",), emits="5m")


def run(bars: list[Candle], marks: list[LegMark]) -> BaseSeries[TrendLine]:
    simple = source()
    pattern = TrendLinesPattern(source=simple, reads=("5m",), emits="5m")
    return pattern.run(
        {
            BARS: {"5m": BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)},
            INSTRUMENT: "WIN@N",
            simple.producer: BaseSeries(
                SeriesIdentity(simple.producer, "WIN@N", "5m"), marks
            ),
        }
    )


def test_producer_embeds_the_producer_of_its_source():
    pattern = TrendLinesPattern(source=source(), reads=("5m",), emits="5m")
    assert pattern.producer == (
        "trend-lines(source=<simple-leg(reads=5m,emits=5m)>,reads=5m,emits=5m)"
    )


def test_identity_carries_the_emitting_timeframe_and_the_engine_s_instrument():
    series = run(*CLEAN)
    assert series.identity.producer.startswith("trend-lines(")
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"


def test_each_point_anchors_on_the_near_pivot_and_carries_the_far_one_whole():
    series = run(*CLEAN)
    first = series.points[0]

    assert first.time == at(0)
    assert first.price == 100.0
    assert first.direction == "low"
    assert first.to.time == at(2)
    assert first.to.price == 102.0
    assert isinstance(first.to, LegMark)


def test_several_lines_share_one_anchor():
    """The first Series where that is routine — three lines all begin on bar 0."""
    series = run(*CLEAN)
    assert [point.time for point in series.points].count(at(0)) == 3


def test_anchors_never_decrease():
    """What `BaseSeries` requires, and all it requires — duplicates are fine."""
    times = [point.time for point in run(*CLEAN).points]
    assert times == sorted(times)


def test_a_line_is_provisional_when_either_endpoint_is():
    bars, marks = CLEAN
    running = [*marks[:-1], LegMark(
        time=marks[-1].time,
        open=marks[-1].open,
        high=marks[-1].high,
        low=marks[-1].low,
        close=marks[-1].close,
        volume=marks[-1].volume,
        price=marks[-1].price,
        direction="low",
        provisional=True,
    )]

    lines = run(bars, running).points
    ends_on_last = [line for line in lines if line.to.time == at(6)]

    assert ends_on_last
    assert all(line.provisional for line in ends_on_last)
    assert not any(line.provisional for line in lines if line.to.time != at(6))


def test_pattern_runs_over_the_engine_bars():
    """End to end through the real `SimpleLegPattern`, with the engine wiring the two together."""
    bars, _ = CLEAN
    simple = source()
    lines = TrendLinesPattern(source=simple, reads=("5m",), emits="5m")
    engine = PatternEngine(
        {"5m": BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)}, (simple, lines)
    )

    ctx = engine.run()

    found: BaseSeries[TrendLine] = ctx[lines.producer]
    assert found.identity == SeriesIdentity(lines.producer, "WIN@N", "5m")
    # Whichever marks `PbMark` picks, every line it produced joins two marks of one side and is
    # anchored on the earlier of them. Which bars get marked is `test_simple_leg.py`'s business.
    for line in found.points:
        assert line.direction == line.to.direction
        assert line.time < line.to.time
