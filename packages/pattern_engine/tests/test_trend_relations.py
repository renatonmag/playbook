"""What bars do around a line that slopes, tested in three layers.

The arithmetic first — `price_at` is the one thing here that `line_relations` does not already do,
so it is settled on its own: where the line is on a bar, over bar positions, rounded to the tick.
Then the run, which is where the two rules that *are* new get asserted — both anchor bars silent,
every bar between and after them asked. And then the Pattern, where the producer key is pinned: the
key must not name the lines, and that is the one property nothing else would catch breaking.

The first test of the run layer is the load-bearing one. A trend line whose two ends sit at the
same price is a level, and over the same bars it has to produce exactly what `line_relations`
produces for that level — Point for Point, including the fields. Everything after it is about the
slope; that one is about the rules being the same rules.

Two fixtures, and both are read by the guard at the bottom so they cannot quietly drift: `FLAT`,
whose line sits at 100.0, and `SLOPED`, whose line runs from 90.0 at bar 0 to 94.0 at bar 2 and
keeps climbing two a bar after that.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.line_relations import Line, PinnedLines, line_relations
from pattern_engine.patterns.trend_relations import (
    NO_TRENDS,
    PinnedTrend,
    PinnedTrends,
    TrendRelationsPattern,
    price_at,
    trend_relations,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: What the flat fixture's line sits at, and the price `FLAT_LEVEL` pins the same line to.
LEVEL = 100.0


def at(index: int) -> datetime:
    """When the `index`-th bar of a five-minute window opens."""
    return OPEN + timedelta(minutes=5 * index)


def bar(open: float, high: float, low: float, close: float, index: int = 0) -> Candle:
    """One bar, `(open, high, low, close)` in the order the fixtures are written."""
    return Candle(time=at(index), open=open, high=high, low=low, close=close, volume=100.0)


def series(*specs: tuple[float, float, float, float]) -> BaseSeries[Candle]:
    return BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"),
        [bar(*spec, index=index) for index, spec in enumerate(specs)],
    )


def trend(
    id: str, start: int, from_price: float, end: int, to_price: float
) -> PinnedTrend:
    """One line, by the indices of its two ends rather than by their timestamps."""
    return PinnedTrend(
        id=id,
        from_time=at(start),
        from_price=from_price,
        to_time=at(end),
        to_price=to_price,
    )


def trends(*pinned: PinnedTrend) -> PinnedTrends:
    return PinnedTrends(pinned)


def kinds(found: list) -> list[tuple[int, str, str | None, str | None]]:
    """A run's Points as `(bar index, kind, wick, side)` — what every assertion below reads."""
    return [
        (round((point.time - OPEN).total_seconds() // 300), point.kind, point.wick, point.side)
        for point in found
    ]


# --- the arithmetic ---------------------------------------------------------------------------


def test_the_price_runs_straight_between_the_two_ends() -> None:
    line = trend("a", 0, 90.0, 4, 98.0)
    assert [price_at(line, 0, 4, index) for index in range(5)] == [
        90.0,
        92.0,
        94.0,
        96.0,
        98.0,
    ]


def test_the_price_keeps_running_past_the_far_end() -> None:
    """The extension the screen draws, which is the reason anybody pins one of these."""
    line = trend("a", 0, 90.0, 2, 94.0)
    assert [price_at(line, 0, 2, index) for index in (3, 4, 10)] == [96.0, 98.0, 110.0]


def test_the_ends_may_arrive_in_either_order() -> None:
    """`from` and `to` are the browser's drawing order, not the clock's — one formula covers both."""
    forwards = trend("a", 0, 90.0, 4, 98.0)
    backwards = trend("a", 4, 98.0, 0, 90.0)

    assert [price_at(forwards, 0, 4, index) for index in range(5)] == [
        price_at(backwards, 4, 0, index) for index in range(5)
    ]


def test_it_counts_bars_and_not_minutes() -> None:
    """Positions, so a session gap shortens the run rather than stretching it — `clear`'s reading.

    The two ends are four bars apart and a whole day apart in the clock; the midpoint is the
    midpoint of the four bars.
    """
    over_a_gap = PinnedTrend(
        id="a",
        from_time=at(0),
        from_price=90.0,
        to_time=at(0) + timedelta(days=1),
        to_price=98.0,
    )
    assert price_at(over_a_gap, 0, 4, 2) == 94.0


def test_the_price_is_rounded_to_the_tick() -> None:
    """Without this, `breaks_out`' strictness on the close would be dead letter.

    The raw sum lands a hair under the tick a reader means, so a close sitting exactly on the line
    would read as being past it — on every bar, for every line whose slope is not a round number.
    """
    line = trend("a", 0, 1.147, 2, 1.14702)

    assert line.from_price + (line.to_price - line.from_price) / 2 != 1.14701
    assert price_at(line, 0, 2, 1) == 1.14701


# --- the run ----------------------------------------------------------------------------------

#: A window whose line sits flat at `LEVEL`: a touch, a breakout, and the seam that undoes it.
FLAT = (
    (95.0, 96.0, 94.0, 95.0),
    (95.0, 96.0, 94.0, 95.0),
    (95.0, 101.0, 94.0, 99.0),
    (99.0, 110.0, 98.0, 105.0),
    (105.0, 106.0, 90.0, 95.0),
    (95.0, 96.0, 94.0, 95.0),
)

#: A window whose line climbs two a bar from 90.0 at bar 0. Bar 2 is the far end and would touch if
#: it were asked; bar 1 lies between the ends and does; bar 5 opens exactly on the line.
SLOPED = (
    (89.0, 91.0, 88.0, 90.0),
    (90.0, 93.0, 89.0, 91.0),
    (91.0, 95.0, 90.0, 93.0),
    (93.0, 97.0, 92.0, 95.0),
    (95.0, 101.0, 94.0, 100.0),
    (100.0, 102.0, 96.0, 97.0),
    (97.0, 98.0, 96.0, 97.0),
)


def test_a_flat_trend_line_answers_exactly_what_the_level_answers() -> None:
    """The one that says these are the same rules and not a second set that resembles them.

    The level is anchored on bar 1, which is the trend line's far end, so the two skip the same
    bars — and then every Point has to agree, field for field.
    """
    bars = series(*FLAT).points
    level = PinnedLines((Line(id="a", time=at(1), price=LEVEL),))

    assert trend_relations(bars, trends(trend("a", 0, LEVEL, 1, LEVEL))) == line_relations(
        bars, level
    )


def test_neither_end_is_ever_asked_about() -> None:
    """They drew the line, so they agree with it by construction and are not evidence of anything.

    Bar 2 is the far end and its upper wick reaches the line — so this is the rule doing work, not
    a bar that had nothing to say either way.
    """
    found = trend_relations(series(*SLOPED).points, trends(trend("a", 0, 90.0, 2, 94.0)))

    assert [index for index, *_ in kinds(found)] == [1, 3, 4, 5, 5]


def test_the_bars_between_the_ends_are_asked() -> None:
    """`clear` vouched for them on bodies only, with two exempt at each end. A touch in there is
    real, and unreported anywhere else."""
    found = trend_relations(series(*SLOPED).points, trends(trend("a", 0, 90.0, 2, 94.0)))

    assert kinds(found)[0] == (1, "touch", "high", "below")


def test_a_sloped_line_is_touched_broken_and_seamed_like_any_other() -> None:
    found = trend_relations(series(*SLOPED).points, trends(trend("a", 0, 90.0, 2, 94.0)))

    assert kinds(found) == [
        (1, "touch", "high", "below"),
        (3, "touch", "high", "below"),
        (4, "breakout", None, "below"),
        # The bar opens exactly on the line: the base of its upper wick touches, and the close
        # carries it back across. Two Points, and the crossing names the side it left.
        (5, "touch", "high", None),
        (5, "seam", None, "above"),
    ]


def test_a_point_carries_the_line_price_on_its_own_bar() -> None:
    """Not the price at either end — the whole difference from a level, in one field."""
    found = trend_relations(series(*SLOPED).points, trends(trend("a", 0, 90.0, 2, 94.0)))

    assert [(index, point.price) for (index, *_), point in zip(kinds(found), found)] == [
        (1, 92.0),
        (3, 96.0),
        (4, 98.0),
        (5, 100.0),
        (5, 100.0),
    ]


def test_a_line_with_an_end_outside_the_window_answers_nothing() -> None:
    """Both ends or none: a slope cannot be resolved from one of them, and guessing it would be
    answering about a line nobody drew."""
    away = trends(
        PinnedTrend(
            id="a",
            from_time=OPEN - timedelta(days=1),
            from_price=90.0,
            to_time=at(2),
            to_price=94.0,
        )
    )
    assert trend_relations(series(*SLOPED).points, away) == []


def test_a_line_whose_ends_land_on_one_bar_answers_nothing() -> None:
    """There is no slope there to run, and no bar after it that is not also the bar before it."""
    assert trend_relations(series(*SLOPED).points, trends(trend("a", 1, 90.0, 1, 94.0))) == []


def test_no_trends_is_an_empty_answer() -> None:
    assert trend_relations(series(*SLOPED).points, NO_TRENDS) == []


def test_two_lines_are_reported_bar_by_bar_in_the_order_they_arrived() -> None:
    """Bars outer, lines inner — which is what keeps the anchors non-decreasing."""
    found = trend_relations(
        series(*FLAT).points,
        trends(trend("b", 0, LEVEL, 1, LEVEL), trend("a", 0, LEVEL, 1, LEVEL)),
    )
    assert [(point.line, point.kind) for point in found] == [
        ("b", "touch"),
        ("a", "touch"),
        ("b", "breakout"),
        ("a", "breakout"),
        ("b", "seam"),
        ("a", "seam"),
    ]


# --- the Pattern ------------------------------------------------------------------------------


def test_the_producer_key_does_not_name_the_lines() -> None:
    """The property `PinnedTrends.__str__` exists for, and the reason this test is here at all."""
    one = TrendRelationsPattern(
        trends=trends(trend("a", 0, 90.0, 2, 94.0)), reads=("5m",), emits="5m"
    )
    other = TrendRelationsPattern(
        trends=trends(trend("z", 1, 5.0, 9, 7.0), trend("y", 2, 1.0, 3, 2.0)),
        reads=("5m",),
        emits="5m",
    )

    assert one.producer == "trend-relations(trends=pinned,reads=5m,emits=5m)"
    assert other.producer == one.producer


def test_the_pattern_runs_over_the_engine_bars() -> None:
    pattern = TrendRelationsPattern(
        trends=trends(trend("a", 0, 90.0, 2, 94.0)), reads=("5m",), emits="5m"
    )
    ctx = PatternEngine({"5m": series(*SLOPED)}, (pattern,)).run()

    found = ctx[pattern.producer]
    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert [(point.line, point.kind, point.side) for point in found.points] == [
        ("a", "touch", "below"),
        ("a", "touch", "below"),
        ("a", "breakout", "below"),
        ("a", "touch", None),
        ("a", "seam", "above"),
    ]


def test_a_pattern_with_no_lines_produces_an_empty_series() -> None:
    """Not a missing key: the Pattern is in the pipeline whether or not anybody drew anything."""
    pattern = TrendRelationsPattern(trends=NO_TRENDS, reads=("5m",), emits="5m")

    assert not PatternEngine({"5m": series(*SLOPED)}, (pattern,)).run()[pattern.producer]


def test_the_fixtures_hold_the_geometry_the_tests_above_assume() -> None:
    """A guard on the fixtures themselves, so the tests cannot quietly start asserting elsewhere."""
    flat = series(*FLAT).points
    assert [candle.close > LEVEL for candle in flat] == [
        False,
        False,
        False,
        True,
        False,
        False,
    ]

    line = trend("a", 0, 90.0, 2, 94.0)
    assert [price_at(line, 0, 2, index) for index in range(7)] == [
        90.0,
        92.0,
        94.0,
        96.0,
        98.0,
        100.0,
        102.0,
    ]
    # Bar 2 is the far end, and it reaches its line: the silence in
    # `test_neither_end_is_ever_asked_about` is the rule and not the bars.
    assert series(*SLOPED).points[2].high >= 94.0 >= max(
        series(*SLOPED).points[2].open, series(*SLOPED).points[2].close
    )
