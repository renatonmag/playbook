"""What bars do around a line, tested in two layers.

The arithmetic first — `touches`, `side_of` and `breaks_out` are three independent questions about
one bar and one price, and each is settled without a Series in sight. Then `line_relations`, which
is only the bookkeeping that carries a crossing forward far enough for the next one to answer it,
and the naming that follows from it — a crossing that answers an earlier one is a seam *instead of*
a breakout, which is what most of the assertions below are counting.
Then the Pattern through a real engine, which is where the producer key is pinned: the key must not
name the lines, and that is the one property of this Pattern nothing else would catch breaking.

The fixtures are built so that the *line price is always 100.0*. A price that moved with the case
would make every assertion below carry an argument about where the line was, when the thing being
tested is where the bar was. `flipped` mirrors a case around that price, so the bearish half of a
rule is never typed twice — the idiom the rest of this suite uses.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.line_relations import (
    NO_LINES,
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    breaks_out,
    line_relations,
    side_of,
    touches,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The price every line in this module sits at. See the module docstring.
LINE = 100.0


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


def flipped(
    specs: tuple[tuple[float, float, float, float], ...],
) -> tuple[tuple[float, float, float, float], ...]:
    """The same bars reflected in `LINE`, so a bull case states its bear twin."""
    return tuple(
        (2 * LINE - o, 2 * LINE - low, 2 * LINE - high, 2 * LINE - c) for o, high, low, c in specs
    )


def lines(*ids_and_times: tuple[str, int]) -> PinnedLines:
    """Lines at `LINE`, each anchored on the bar at the given index."""
    return PinnedLines(tuple(Line(id=id, time=at(index), price=LINE) for id, index in ids_and_times))


def kinds(found: list[LineRelation]) -> list[tuple[int, str, str | None, str | None]]:
    """A run's Points as `(bar index, kind, wick, side)` — what every assertion below reads."""
    return [
        (round((point.time - OPEN).total_seconds() // 300), point.kind, point.wick, point.side)
        for point in found
    ]


# --- the arithmetic ---------------------------------------------------------------------------


def test_a_price_in_the_upper_wick_is_a_touch_of_the_high_side() -> None:
    assert touches(bar(90.0, 105.0, 89.0, 95.0), LINE) == "high"


def test_a_price_in_the_lower_wick_is_a_touch_of_the_low_side() -> None:
    assert touches(bar(110.0, 111.0, 95.0, 105.0), LINE) == "low"


def test_the_ends_of_a_wick_count_as_inside_it() -> None:
    """Inclusive at both ends: the extreme itself, and where the wick leaves the body."""
    assert touches(bar(90.0, 100.0, 89.0, 95.0), LINE) == "high"
    assert touches(bar(100.0, 105.0, 89.0, 100.0), LINE) == "high"


def test_a_price_inside_the_body_touches_nothing() -> None:
    """The case the module docstring argues about: it is a breakout, and it is only that."""
    body = bar(90.0, 115.0, 85.0, 110.0)
    assert touches(body, LINE) is None
    assert breaks_out(body, LINE) == "above"


def test_a_wick_of_zero_length_cannot_be_touched() -> None:
    """`high == max(open, close)` means there is no upper wick to be inside of."""
    assert touches(bar(95.0, 100.0, 94.0, 100.0), LINE) is None


def test_a_price_the_bar_never_reached_touches_nothing() -> None:
    assert touches(bar(80.0, 90.0, 79.0, 85.0), LINE) is None


@pytest.mark.parametrize(
    ("opened", "expected"), [(110.0, "above"), (90.0, "below"), (100.0, None)]
)
def test_the_side_is_where_the_bar_opened(opened: float, expected: str | None) -> None:
    assert side_of(bar(opened, 120.0, 80.0, opened), LINE) == expected


def test_a_breakout_reports_the_side_it_closed_on() -> None:
    assert breaks_out(bar(90.0, 115.0, 89.0, 110.0), LINE) == "above"
    assert breaks_out(bar(110.0, 111.0, 85.0, 90.0), LINE) == "below"


def test_a_bar_that_stayed_on_one_side_is_no_breakout() -> None:
    assert breaks_out(bar(90.0, 99.0, 85.0, 95.0), LINE) is None


def test_a_close_exactly_on_the_line_is_no_breakout() -> None:
    """Strict at both ends — a price that is the line has not crossed it."""
    assert breaks_out(bar(90.0, 105.0, 89.0, 100.0), LINE) is None
    assert breaks_out(bar(100.0, 115.0, 99.0, 110.0), LINE) is None


# --- the run ----------------------------------------------------------------------------------

#: An anchor bar, then a bar whose upper wick reaches the line, then one that ignores it.
TOUCHING = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 105.0, 89.0, 95.0),
    (80.0, 85.0, 79.0, 84.0),
)

#: An anchor, a break up, a break back down within the span, then a bar that does nothing.
SEAMED = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 115.0, 89.0, 110.0),
    (110.0, 111.0, 85.0, 90.0),
    (80.0, 85.0, 79.0, 84.0),
)


def test_the_anchor_bar_is_never_asked_about() -> None:
    """It made the level, so it agrees with it by construction and says nothing."""
    anchored = ((90.0, 115.0, 89.0, 110.0), (80.0, 85.0, 79.0, 84.0))
    assert line_relations(series(*anchored).points, lines(("a", 0))) == []


@pytest.mark.parametrize("specs", [TOUCHING, flipped(TOUCHING)])
def test_a_wick_reaching_the_line_is_reported_once(specs: tuple) -> None:
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [(1, "touch")]


def test_a_touch_names_the_wick_and_where_the_bar_opened() -> None:
    found = line_relations(series(*TOUCHING).points, lines(("a", 0)))
    assert kinds(found) == [(1, "touch", "high", "below")]
    assert kinds(line_relations(series(*flipped(TOUCHING)).points, lines(("a", 0)))) == [
        (1, "touch", "low", "above")
    ]


@pytest.mark.parametrize("specs", [SEAMED, flipped(SEAMED)])
def test_a_breakout_and_its_reversal_are_a_seam(specs: tuple) -> None:
    """The reversing bar answers once, and the answer is `seam` — the breakout it would otherwise
    have been is not emitted beside it."""
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [
        (1, "breakout"),
        (2, "seam"),
    ]


@pytest.mark.parametrize("specs", [SEAMED, flipped(SEAMED)])
def test_a_seam_is_the_only_point_its_bar_emits(specs: tuple) -> None:
    """The property the naming rests on, asserted on the bar rather than on the whole run."""
    found = line_relations(series(*specs).points, lines(("a", 0)))
    reversing = [point for point in found if point.time == at(2)]

    assert [point.kind for point in reversing] == ["seam"]


def test_a_seam_carries_the_bar_that_broke_out_first() -> None:
    found = line_relations(series(*SEAMED).points, lines(("a", 0)))
    seam = next(point for point in found if point.kind == "seam")
    assert seam.since is not None
    assert seam.since.time == at(1)
    assert seam.price == LINE
    assert seam.line == "a"


def test_a_reversal_two_bars_later_is_still_a_seam() -> None:
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (105.0, 112.0, 101.0, 108.0),
        (110.0, 111.0, 85.0, 90.0),
    )
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [
        (1, "breakout"),
        (3, "seam"),
    ]


def test_a_reversal_three_bars_later_is_not_a_seam() -> None:
    """The whole content of `SEAM_SPAN`, and the one case that says the span is real."""
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (105.0, 112.0, 101.0, 108.0),
        (105.0, 112.0, 101.0, 108.0),
        (110.0, 111.0, 85.0, 90.0),
    )
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [kind for _, kind, _, _ in kinds(found)] == ["breakout", "breakout"]


def test_two_breakouts_the_same_way_are_not_a_seam() -> None:
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (95.0, 115.0, 94.0, 110.0),
    )
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [kind for _, kind, _, _ in kinds(found)] == ["breakout", "breakout"]


def test_a_bar_that_closes_one_seam_can_open_the_next() -> None:
    """Three alternating crossings are a breakout and two seams: being named a seam does not take
    a bar out of the running for the next one."""
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (110.0, 111.0, 85.0, 90.0),
        (90.0, 115.0, 89.0, 110.0),
    )
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [
        (1, "breakout"),
        (2, "seam"),
        (3, "seam"),
    ]


def test_a_line_whose_bar_is_outside_the_window_answers_nothing() -> None:
    """The reading the monitor already gives a pin that scrolled away: silence, not an error."""
    away = PinnedLines((Line(id="a", time=OPEN - timedelta(days=1), price=LINE),))
    assert line_relations(series(*SEAMED).points, away) == []


def test_no_lines_is_an_empty_answer() -> None:
    assert line_relations(series(*SEAMED).points, NO_LINES) == []


def test_two_lines_are_reported_bar_by_bar_in_the_order_they_arrived() -> None:
    """Bars outer, lines inner — which is what keeps the anchors non-decreasing."""
    found = line_relations(series(*SEAMED).points, lines(("b", 0), ("a", 0)))
    assert [(point.line, point.kind) for point in found] == [
        ("b", "breakout"),
        ("a", "breakout"),
        ("b", "seam"),
        ("a", "seam"),
    ]


# --- the Pattern ------------------------------------------------------------------------------


def test_the_producer_key_does_not_name_the_lines() -> None:
    """The property `PinnedLines.__str__` exists for, and the reason this test is here at all."""
    one = LineRelationsPattern(lines=lines(("a", 0)), reads=("5m",), emits="5m")
    other = LineRelationsPattern(lines=lines(("z", 2), ("y", 3)), reads=("5m",), emits="5m")

    assert one.producer == "line-relations(lines=pinned,reads=5m,emits=5m)"
    assert other.producer == one.producer


def test_the_pattern_runs_over_the_engine_bars() -> None:
    pattern = LineRelationsPattern(lines=lines(("a", 0)), reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*SEAMED)}, (pattern,))
    ctx = engine.run()

    found: BaseSeries[LineRelation] = ctx[pattern.producer]
    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert [(point.line, point.kind, point.side) for point in found.points] == [
        ("a", "breakout", "below"),
        ("a", "seam", "above"),
    ]


def test_a_pattern_with_no_lines_produces_an_empty_series() -> None:
    """Not a missing key: the Pattern is in the pipeline whether or not anybody drew anything."""
    pattern = LineRelationsPattern(lines=NO_LINES, reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*SEAMED)}, (pattern,))

    assert not engine.run()[pattern.producer]


def test_the_fixtures_hold_the_crossings_the_tests_above_assume() -> None:
    """A guard on the fixtures themselves, so the tests cannot quietly start asserting elsewhere."""
    bars = series(*SEAMED).points
    assert [breaks_out(candle, LINE) for candle in bars] == [None, "above", "below", None]
    assert [touches(candle, LINE) for candle in bars] == [None, None, None, None]
