"""What bars do around a line, tested in two layers.

The arithmetic first — `touches`, `side_of` and `breaks_out` are three independent questions about
one bar and one price, and each is settled without a Series in sight. Then `line_relations`, which
is only the bookkeeping that carries a crossing forward far enough for the next one to answer it,
and the naming that follows from it — a crossing that answers an earlier one is a seam *instead of*
a breakout, which is what most of the assertions below are counting.
Then the Pattern through a real engine, which is where the producer key is pinned: the key must not
name the lines, and that is the one property of this Pattern nothing else would catch breaking.

The fourth kind, `close`, is tested in the same two layers and with one extra thing to establish:
that it is off unless a rule and a leg both arrive, and that it never lands on a bar one of the
other three already answered about.

The fixtures are built so that the *line price is always 100.0*. A price that moved with the case
would make every assertion below carry an argument about where the line was, when the thing being
tested is where the bar was. `flipped` mirrors a case around that price, so the bearish half of a
rule is never typed twice — the idiom the rest of this suite uses.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.leg_processor import Leg, LegPattern
from pattern_engine.patterns.line_relations import (
    NO_LINES,
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    breaks_out,
    leg_spans,
    line_relations,
    nears,
    side_of,
    touches,
)
from pattern_engine.patterns.proximity import NO_PROXIMITY, ProximityLevel, ProximityRule
from pattern_engine.patterns.zigzag import ZigZagPattern
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
    """Strict on the close — a bar that stopped at the line has not crossed it."""
    assert breaks_out(bar(90.0, 105.0, 89.0, 100.0), LINE) is None


def test_a_bar_that_opened_on_the_line_breaks_out_to_the_side_it_closed_on() -> None:
    """The open is not strict: with no side to have left, the close alone says which one it took."""
    assert breaks_out(bar(100.0, 115.0, 99.0, 110.0), LINE) == "above"
    assert breaks_out(bar(100.0, 101.0, 85.0, 90.0), LINE) == "below"


def test_a_bar_that_opened_and_closed_on_the_line_is_no_breakout() -> None:
    """Both ends on the line: it never left, and the strict close is what says so."""
    assert breaks_out(bar(100.0, 108.0, 92.0, 100.0), LINE) is None


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


def test_a_reversal_three_bars_later_is_still_a_seam() -> None:
    """The far edge of `SEAM_SPAN` from the inside: two bars may sit between the two crossings."""
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (105.0, 112.0, 101.0, 108.0),
        (105.0, 112.0, 101.0, 108.0),
        (110.0, 111.0, 85.0, 90.0),
    )
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [
        (1, "breakout"),
        (4, "seam"),
    ]


def test_a_reversal_four_bars_later_is_not_a_seam() -> None:
    """The whole content of `SEAM_SPAN`, and the one case that says the span is real."""
    specs = (
        (80.0, 85.0, 79.0, 84.0),
        (90.0, 115.0, 89.0, 110.0),
        (105.0, 112.0, 101.0, 108.0),
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


#: A break up, a bar that stops exactly on the line, and a bar that opens on the line and steps off
#: it downwards. The third bar is the crossing that used to go unseen — see the module docstring of
#: `line_relations` on the open.
STEPPED_OFF = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 115.0, 89.0, 110.0),
    (105.0, 112.0, 100.0, 100.0),
    (100.0, 101.0, 85.0, 90.0),
)


@pytest.mark.parametrize("specs", [STEPPED_OFF, flipped(STEPPED_OFF)])
def test_a_bar_that_steps_off_the_line_undoes_the_break_before_it(specs: tuple) -> None:
    """The bar between them closed *on* the line and broke nothing, so the reversal is the third.

    Its open is the line, so the line is the base of one of its wicks and it touches as well: the
    one bar that carries two Points for one line.
    """
    found = line_relations(series(*specs).points, lines(("a", 0)))
    assert [(index, kind) for index, kind, _, _ in kinds(found)] == [
        (1, "breakout"),
        (3, "touch"),
        (3, "seam"),
    ]


def test_a_crossing_off_the_line_came_from_the_side_it_did_not_close_on() -> None:
    """`side` is the side price came from, and a bar opening on the line has only its close to say
    so. The touch on the same bar has nothing to go on and says nothing."""
    found = line_relations(series(*STEPPED_OFF).points, lines(("a", 0)))
    assert [(kind, side) for _, kind, _, side in kinds(found)] == [
        ("breakout", "below"),
        ("touch", None),
        ("seam", "above"),
    ]

    up = line_relations(series(*flipped(STEPPED_OFF)).points, lines(("a", 0)))
    assert [(kind, side) for _, kind, _, side in kinds(up)] == [
        ("breakout", "above"),
        ("touch", None),
        ("seam", "below"),
    ]


def test_a_seam_off_the_line_still_carries_the_break_it_undid() -> None:
    found = line_relations(series(*STEPPED_OFF).points, lines(("a", 0)))
    seam = next(point for point in found if point.kind == "seam")
    assert seam.since is not None
    assert seam.since.time == at(1)


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

    assert one.producer == (
        "line-relations(lines=pinned,proximity=proximidade,legs=None,reads=5m,emits=5m)"
    )
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


# --- the near miss ----------------------------------------------------------------------------

#: Near is a tenth of the leg, for every leg this file measures. One rung, because which rung gets
#: picked is `test_proximity`'s question and the fixtures here would only restate it.
NEAR = ProximityRule(name="proximidade", levels=(ProximityLevel(points=10.0, trigger=0.1),))


def spans(*values: float | None) -> list[float | None]:
    """A leg span per bar, written out — what `leg_spans` computes and these cases assume."""
    return list(values)


#: A bar that ran up to 93 and turned, under a line at 100. Seven points short, so a leg of 100 (a
#: reach of ten) names it and a leg of 30 (a reach of three, five on the grid) does not. The bar
#: before it is the line's own anchor and is skipped.
#:
#: Seven and not four because the reach is rounded to a five-point tick: under a grid that coarse,
#: the two legs have to be told apart by a gap wider than the tick itself.
STOPPED_SHORT = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 93.0, 89.0, 92.0),
)


def test_a_bar_that_stopped_short_within_the_reach_is_a_close() -> None:
    assert nears(bar(90.0, 96.0, 89.0, 92.0), LINE, 10.0) == ("below", 4.0)


def test_a_bar_that_stopped_short_outside_the_reach_is_nothing() -> None:
    assert nears(bar(90.0, 96.0, 89.0, 92.0), LINE, 3.0) is None


def test_the_side_is_where_the_bar_was_and_the_bear_case_says_the_same() -> None:
    """`side` means the side price came from, here as on the other three kinds."""
    assert nears(bar(110.0, 111.0, 104.0, 108.0), LINE, 10.0) == ("above", 4.0)


def test_a_bar_that_stopped_exactly_the_reach_short_is_a_close() -> None:
    """The boundary belongs to the near side, and a point past it to nobody.

    Worth its own case because the reach is now a rounded number: a gap that lands exactly on the
    tick is the common reading, not the corner one.
    """
    assert nears(bar(90.0, 95.0, 89.0, 92.0), LINE, 5.0) == ("below", 5.0)
    assert nears(bar(90.0, 94.0, 89.0, 92.0), LINE, 5.0) is None


def test_a_bar_that_reached_the_line_is_not_a_near_miss() -> None:
    """The complement of `touches`, and where the two meet: contact is contact, not a miss."""
    assert nears(bar(90.0, 100.0, 89.0, 95.0), LINE, 10.0) is None
    assert touches(bar(90.0, 100.0, 89.0, 95.0), LINE) == "high"


def test_a_line_inside_the_bar_is_not_a_near_miss_however_small_the_gap() -> None:
    """A body through the line is a breakout, and this function has nothing to add to that."""
    assert nears(bar(95.0, 106.0, 94.0, 105.0), LINE, 10.0) is None
    assert breaks_out(bar(95.0, 106.0, 94.0, 105.0), LINE) == "above"


def test_a_close_is_reported_when_the_leg_grants_the_reach() -> None:
    found = line_relations(series(*STOPPED_SHORT).points, lines(("a", 0)), NEAR, spans(100.0, 100.0))
    assert kinds(found) == [(1, "close", None, "below")]
    assert (found[0].gap, found[0].leg) == (7.0, 100.0)


def test_the_same_bar_under_a_smaller_leg_says_nothing() -> None:
    """The whole point of scaling: seven points short of a thirty-point move is not a near miss."""
    assert line_relations(series(*STOPPED_SHORT).points, lines(("a", 0)), NEAR, spans(30.0, 30.0)) == []


def test_a_bar_no_leg_covers_says_nothing() -> None:
    assert line_relations(series(*STOPPED_SHORT).points, lines(("a", 0)), NEAR, spans(None, None)) == []


def test_without_a_rule_the_other_three_answer_exactly_as_they_did() -> None:
    """The default, stated as a test: a caller that passes neither gets the old Series, Point for Point."""
    bars, pinned = series(*SEAMED).points, lines(("a", 0))
    assert line_relations(bars, pinned) == line_relations(bars, pinned, NO_PROXIMITY, spans(*[1e9] * 4))


def test_a_close_never_lands_on_a_bar_another_kind_answered_about() -> None:
    """Exclusive by construction — see the module docstring on `line_relations`.

    A reach wide enough to name every bar in the window, so nothing but the construction itself can
    be keeping the kinds apart. The two crossing bars stay crossings; the bar that did neither is
    the only one free to be a near miss.
    """
    found = line_relations(series(*SEAMED).points, lines(("a", 0)), NEAR, spans(*[1e9] * 4))
    closed = {point.time for point in found if point.kind == "close"}
    other = {point.time for point in found if point.kind != "close"}

    assert closed and other
    assert not closed & other


def test_only_a_close_carries_a_gap_and_a_leg() -> None:
    found = line_relations(series(*STOPPED_SHORT).points, lines(("a", 0)), NEAR, spans(100.0, 100.0))
    found += line_relations(series(*SEAMED).points, lines(("a", 0)))
    assert [(point.kind, point.gap is None, point.leg is None) for point in found] == [
        ("close", False, False),
        ("breakout", True, True),
        ("seam", True, True),
    ]


# --- the leg spans ----------------------------------------------------------------------------


def leg(*indices: int) -> Leg:
    """A leg over the bars of `STAIRS` at `indices`, anchored on the first of them."""
    bars = tuple(series(*STAIRS).points[index] for index in indices)
    return Leg.anchored(bars[0], bars=bars)


#: Three bars climbing, so a leg over the first two spans less than one over all three. The shared
#: bar is the middle one, which is what the boundary rule below is about.
STAIRS = (
    (10.0, 20.0, 10.0, 18.0),
    (18.0, 40.0, 17.0, 38.0),
    (38.0, 90.0, 37.0, 88.0),
)


def test_a_span_is_the_height_of_the_leg_and_not_the_distance_between_its_vertices() -> None:
    """A wick that overshot the vertex counts: 40 minus 10, not 38 minus 10."""
    assert leg_spans(series(*STAIRS).points, [leg(0, 1)]) == [30.0, 30.0, None]


def test_a_boundary_bar_takes_the_span_of_the_leg_it_opens() -> None:
    """Legs overlap by one bar, and the move in force from it is the new one."""
    assert leg_spans(series(*STAIRS).points, [leg(0, 1), leg(1, 2)]) == [30.0, 73.0, 73.0]


def test_a_window_with_no_legs_has_no_spans() -> None:
    assert leg_spans(series(*STAIRS).points, []) == [None, None, None]


# --- the near miss through the engine -----------------------------------------------------------

#: A climb that runs to 96 and turns back down, under a line at 100. One leg over the whole window,
#: 48 points tall, so the rung's tenth grants a reach of 4.8 — five, on the tick the reach is
#: rounded to — and the bar four points short is inside it while the one that fell away by seven
#: is not.
APPROACHED = (
    (50.0, 55.0, 48.0, 54.0),
    (54.0, 70.0, 53.0, 69.0),
    (69.0, 96.0, 68.0, 92.0),
    (92.0, 93.0, 80.0, 82.0),
)



def test_the_pattern_reads_its_leg_source_and_reports_near_misses() -> None:
    """The ordering constraint the fourth kind brings, exercised: legs first, relations after."""
    zigzag = ZigZagPattern(depth=1, reads=("5m",), emits="5m")
    legs = LegPattern(source=zigzag, reads=("5m",), emits="5m")
    pattern = LineRelationsPattern(
        lines=lines(("a", 0)), proximity=NEAR, legs=legs, reads=("5m",), emits="5m"
    )
    engine = PatternEngine({"5m": series(*APPROACHED)}, (zigzag, legs, pattern))

    found: BaseSeries[LineRelation] = engine.run()[pattern.producer]
    assert [(point.kind, point.gap) for point in found.points] == [("close", 4.0)]


def test_declared_before_its_legs_it_writes_nothing() -> None:
    """A missing key is what the wrong order costs — the same reading `LineRespectPattern` gives."""
    zigzag = ZigZagPattern(depth=1, reads=("5m",), emits="5m")
    legs = LegPattern(source=zigzag, reads=("5m",), emits="5m")
    pattern = LineRelationsPattern(
        lines=lines(("a", 0)), proximity=NEAR, legs=legs, reads=("5m",), emits="5m"
    )
    engine = PatternEngine({"5m": series(*APPROACHED)}, (zigzag, pattern, legs))

    assert pattern.producer not in engine.run()


def test_a_pattern_with_legs_and_no_rule_reports_the_three_kinds_it_always_did() -> None:
    zigzag = ZigZagPattern(depth=1, reads=("5m",), emits="5m")
    legs = LegPattern(source=zigzag, reads=("5m",), emits="5m")
    pattern = LineRelationsPattern(lines=lines(("a", 0)), legs=legs, reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*APPROACHED)}, (zigzag, legs, pattern))

    assert not engine.run()[pattern.producer]
