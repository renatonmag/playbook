"""The stretches a line held, tested in three layers.

The arithmetic first — `respected_side` and `undone_breakouts` are two independent readings of
Points that already exist, and neither needs a run. Then `line_respects`, which is the whole of the
rule: what extends a run, what ends one, and what the run covers once it is closed. Then the
Pattern through a real engine, alongside its source, because a Pattern that reads a producer key is
one whose key and whose ordering are the two things nothing else would catch breaking.

The fixtures are built on `line_relations` rather than on hand-written `LineRelation`s, and that is
deliberate: a group is a claim about that Pattern's output, and a fixture typed by hand could hold
a combination it never emits — a breakout whose `since` names a bar two runs away, say. Building
them from bars keeps the two Patterns arguing about the same events.

As in `test_line_relations`, the *line price is always 100.0*, and `flipped` mirrors a case around
it so a bull fixture states its bear twin.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.line_relations import (
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    line_relations,
)
from pattern_engine.patterns.line_respect import (
    LineRespect,
    LineRespectPattern,
    line_respects,
    respected_side,
    undone_breakouts,
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


def index(moment: datetime) -> int:
    """Which bar of the window `moment` opens, so assertions read as positions and not as clocks."""
    return round((moment - OPEN).total_seconds() // 300)


def runs(
    specs: tuple[tuple[float, float, float, float], ...], *ids_and_times: tuple[str, int]
) -> list[tuple[str, str, int, int]]:
    """The groups of one window as `(line, side, first bar, last bar)` — what most tests read."""
    bars = series(*specs).points
    found = line_respects(line_relations(bars, lines(*ids_and_times)), bars)
    return [
        (point.line, point.side, index(point.bars[0].time), index(point.time)) for point in found
    ]


# --- the fixtures -------------------------------------------------------------------------------

#: An anchor, two bars whose upper wick reaches up to the line, and a quiet bar between them. Both
#: touches are made from *underneath*, so the line is held from below throughout — the direction a
#: fixture is easiest to misread, and the reason it is spelled out here. The quiet bar is what
#: separates them: two groups of one bar each, not one group of three.
HELD = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 105.0, 89.0, 95.0),
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 100.0, 89.0, 95.0),
)

#: An anchor, a touch from below, then a break upwards that nothing takes back, then a touch made
#: from the far side. Two groups with the breakout between them, in neither.
BROKEN = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 105.0, 89.0, 95.0),
    (90.0, 115.0, 89.0, 110.0),
    (110.0, 111.0, 100.0, 105.0),
)

#: An anchor and two touches from below on neighbouring bars, with nothing between them to end the
#: run. One group of two, and the case `HELD` no longer covers.
ADJACENT = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 105.0, 89.0, 95.0),
    (90.0, 105.0, 89.0, 95.0),
)

#: An anchor, a break up, a break back down inside the span, then a break up again. Three
#: crossings, two seams, and no breakout that stands — one group over all three bars, held from
#: below, since that is where the first of them opened.
WHIPPED = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 115.0, 89.0, 110.0),
    (110.0, 111.0, 85.0, 90.0),
    (90.0, 115.0, 89.0, 110.0),
)


# --- the arithmetic -----------------------------------------------------------------------------


def relation(kind: str, side: str | None) -> LineRelation:
    """A bare Point, for the two readings that look at nothing but `kind` and `side`."""
    return LineRelation.anchored(
        bar(90.0, 105.0, 89.0, 95.0), line="a", price=LINE, kind=kind, wick=None, side=side,
        since=None,
    )


#: An anchor, a bar holding the line from below, and a bar that opens *on* the line and steps off
#: it downwards. That last bar answers twice — the line is the base of its upper wick, so it touches
#: as well as breaks — which is the only way a group's separator can also be one of its events.
STEPPED_OFF = (
    (80.0, 85.0, 79.0, 84.0),
    (90.0, 105.0, 89.0, 95.0),
    (100.0, 101.0, 85.0, 90.0),
)


def test_a_touch_respected_the_side_it_opened_on() -> None:
    assert respected_side(relation("touch", "above")) == "above"
    assert respected_side(relation("touch", "below")) == "below"


def test_an_undone_breakout_respected_the_side_it_opened_on() -> None:
    """It left and came back, so the side it started from is the one that held."""
    assert respected_side(relation("breakout", "above")) == "above"


def test_a_seam_respected_the_side_it_did_not_open_on() -> None:
    """It opened on the side the earlier crossing reached and closed back off it."""
    assert respected_side(relation("seam", "above")) == "below"
    assert respected_side(relation("seam", "below")) == "above"


def test_a_bar_that_opened_on_the_line_respected_nothing() -> None:
    assert respected_side(relation("touch", None)) is None


def test_the_undone_breakouts_are_the_bars_the_seams_name() -> None:
    """Read off `since` rather than re-derived, so the two Patterns cannot disagree."""
    bars = series(*WHIPPED).points
    found = line_relations(bars, lines(("a", 0)))

    assert undone_breakouts(found) == {at(1), at(2)}


def test_a_run_with_no_seams_has_nothing_undone() -> None:
    bars = series(*BROKEN).points
    assert undone_breakouts(line_relations(bars, lines(("a", 0)))) == set()


# --- the run ------------------------------------------------------------------------------------


def test_a_lone_touch_is_a_group_of_one_bar() -> None:
    """No minimum: one rejection is a stretch the line held, however short."""
    lone = ((80.0, 85.0, 79.0, 84.0), (90.0, 105.0, 89.0, 95.0))
    assert runs(lone, ("a", 0)) == [("a", "below", 1, 1)]


@pytest.mark.parametrize("specs", [ADJACENT, flipped(ADJACENT)])
def test_touches_on_neighbouring_bars_are_one_group(specs: tuple) -> None:
    """Nothing between them to end the run, so the two touches are one stretch."""
    held = "below" if specs == ADJACENT else "above"
    assert runs(specs, ("a", 0)) == [("a", held, 1, 2)]


@pytest.mark.parametrize("specs", [HELD, flipped(HELD)])
def test_a_quiet_bar_between_two_touches_ends_the_group(specs: tuple) -> None:
    """Bar 2 says nothing about the line, so the line was not being held over it."""
    held = "below" if specs == HELD else "above"
    assert runs(specs, ("a", 0)) == [("a", held, 1, 1), ("a", held, 3, 3)]


def test_a_group_carries_the_bars_it_covers_and_no_others() -> None:
    bars = series(*HELD).points
    found = line_respects(line_relations(bars, lines(("a", 0))), bars)

    assert [point.bars for point in found] == [(bars[1],), (bars[3],)]


@pytest.mark.parametrize("specs", [BROKEN, flipped(BROKEN)])
def test_a_definitive_breakout_closes_a_group_and_joins_none(specs: tuple) -> None:
    """Bar 2 breaks and nothing takes it back, so neither group reaches it."""
    held, then = ("below", "above") if specs == BROKEN else ("above", "below")
    assert runs(specs, ("a", 0)) == [("a", held, 1, 1), ("a", then, 3, 3)]


@pytest.mark.parametrize("specs", [WHIPPED, flipped(WHIPPED)])
def test_the_breakout_a_seam_undid_is_inside_the_group(specs: tuple) -> None:
    """All three crossings are one run: the first is undone, and the other two are the seams."""
    assert runs(specs, ("a", 0)) == [("a", "below" if specs == WHIPPED else "above", 1, 3)]


def test_a_breakout_that_also_touched_still_joins_no_group() -> None:
    """The bar that broke is in the run by its own touch, and comes back out: a separator is not a
    member, whichever way it got in. The group is bar 1 alone."""
    assert runs(STEPPED_OFF, ("a", 0)) == [("a", "below", 1, 1)]


def test_the_side_is_the_first_event_that_could_say() -> None:
    """A bar that opened exactly on the line decides nothing; the next one in the run does."""
    on_the_line = (
        (80.0, 85.0, 79.0, 84.0),
        (100.0, 105.0, 95.0, 100.0),
        (90.0, 105.0, 89.0, 95.0),
    )
    assert runs(on_the_line, ("a", 0)) == [("a", "below", 1, 2)]


def test_a_run_that_never_says_which_side_is_dropped() -> None:
    """Its only event opened on the line, so there is no stretch anybody could be shown."""
    on_the_line = ((80.0, 85.0, 79.0, 84.0), (100.0, 105.0, 95.0, 100.0))
    assert runs(on_the_line, ("a", 0)) == []


def test_a_group_still_open_at_the_window_edge_is_emitted() -> None:
    """On the same terms as one a breakout ended, and with no mark saying it might grow."""
    assert runs(HELD, ("a", 0))[-1] == ("a", "below", 3, 3)


def test_two_lines_answer_with_anchors_that_do_not_decrease() -> None:
    """The property the sort exists for: runs close per line, in no order across lines."""
    bars = series(*BROKEN).points
    found = line_respects(line_relations(bars, lines(("a", 0), ("b", 0))), bars)
    anchors = [point.time for point in found]

    assert anchors == sorted(anchors)
    assert {point.line for point in found} == {"a", "b"}


def test_nothing_is_emitted_without_events_or_bars() -> None:
    assert line_respects([], series(*HELD).points) == []
    assert line_respects(line_relations(series(*HELD).points, lines(("a", 0))), []) == []


# --- the Pattern --------------------------------------------------------------------------------


def test_the_producer_key_names_its_source() -> None:
    """Which is what makes the source an instance rather than a key written out by hand."""
    source = LineRelationsPattern(lines=lines(("a", 0)), reads=("5m",), emits="5m")
    pattern = LineRespectPattern(source=source, reads=("5m",), emits="5m")

    assert pattern.producer == (
        "line-respect(source=<line-relations(lines=pinned,reads=5m,emits=5m)>,reads=5m,emits=5m)"
    )


def test_the_pattern_runs_over_its_source_and_the_engine_bars() -> None:
    source = LineRelationsPattern(lines=lines(("a", 0)), reads=("5m",), emits="5m")
    pattern = LineRespectPattern(source=source, reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*BROKEN)}, (source, pattern))
    ctx = engine.run()

    found: BaseSeries[LineRespect] = ctx[pattern.producer]
    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert [(point.line, point.side, index(point.time)) for point in found.points] == [
        ("a", "below", 1),
        ("a", "above", 3),
    ]


def test_a_source_with_no_lines_produces_an_empty_series() -> None:
    """Empty rather than missing, exactly as its source is — see `line_relations`."""
    source = LineRelationsPattern(lines=PinnedLines(()), reads=("5m",), emits="5m")
    pattern = LineRespectPattern(source=source, reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*HELD)}, (source, pattern))

    assert not engine.run()[pattern.producer]


def test_declared_before_its_source_it_writes_nothing() -> None:
    """The ordering constraint, stated as a test: a missing key is what the wrong order costs."""
    source = LineRelationsPattern(lines=lines(("a", 0)), reads=("5m",), emits="5m")
    pattern = LineRespectPattern(source=source, reads=("5m",), emits="5m")
    ctx = PatternEngine({"5m": series(*HELD)}, (pattern, source)).run()

    assert pattern.producer not in ctx


def test_the_fixtures_hold_the_events_the_tests_above_assume() -> None:
    """A guard on the fixtures themselves, so the tests cannot quietly start asserting elsewhere."""
    def events(specs: tuple) -> list[tuple[int, str]]:
        bars = series(*specs).points
        return [(index(p.time), p.kind) for p in line_relations(bars, lines(("a", 0)))]

    assert events(HELD) == [(1, "touch"), (3, "touch")]
    assert events(ADJACENT) == [(1, "touch"), (2, "touch")]
    assert events(BROKEN) == [(1, "touch"), (2, "breakout"), (3, "touch")]
    assert events(WHIPPED) == [(1, "breakout"), (2, "seam"), (3, "seam")]
    assert events(STEPPED_OFF) == [(1, "touch"), (2, "touch"), (2, "breakout")]
