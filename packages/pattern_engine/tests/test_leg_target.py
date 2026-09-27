"""Where a leg reached a line that held it, tested in three layers.

`AGREES` first — a two-entry table, and the one thing in this module that can be read without a
run. Then `leg_targets`, which is the whole of the rule: which bar is the extreme, which groups
count, and which legs are asked about at all. Then the Pattern through a real engine, alongside all
three of its sources, because a Pattern that reads three producer keys is one whose key and whose
ordering are the two things nothing else would catch breaking.

Every source Point here is built by **running the real upstream code** — `SimpleLegPattern` and
`split_legs` for the legs and the marks, `line_relations` and `line_respects` for the groups — and
never typed by hand. A target is a claim about the meeting of those two Series, and a hand-written
fixture could hold a combination neither Pattern emits: a group whose `side` disagrees with its own
bars, say, or a leg cut somewhere `split_legs` would not cut one. Building both from bars keeps all
three Patterns arguing about the same window.

As in `test_line_respect`, the *line price is always 100.0* where it stands for the line under test,
and `flipped` mirrors a case around it so the bull fixture states its bear twin. `FAR` is the one
line deliberately somewhere else: it is the far-side line, and its price has to sit inside the bars
rather than at their edge.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_processor import Leg, LegPattern, split_legs
from pattern_engine.patterns.leg_target import AGREES, LegTargetPattern, leg_targets
from pattern_engine.patterns.line_relations import (
    Line,
    LineRelationsPattern,
    PinnedLines,
    line_relations,
)
from pattern_engine.patterns.line_respect import LineRespect, LineRespectPattern, line_respects
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.trend_relations import PinnedTrends, TrendRelationsPattern
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The price of the line a target is expected against. See the module docstring.
LINE = 100.0

#: The far-side line: the one price held from the *other* side, which no leg here targets. At the low
#: of the bar that makes the bull fixture's extreme, so it is touched on exactly that bar.
FAR = 88.0


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
    """The same bars reflected in `LINE`, so the bull case states its bear twin."""
    return tuple(
        (2 * LINE - o, 2 * LINE - low, 2 * LINE - high, 2 * LINE - c) for o, high, low, c in specs
    )


def index(moment: datetime) -> int:
    """Which bar of the window `moment` opens, so assertions read as positions and not as clocks."""
    return round((moment - OPEN).total_seconds() // 300)


#: A window with four marked legs in it, the first of them running up into `LINE` twice and turning
#: away from it.
#:
#: What each leg is for, since one fixture carries every case: the leg closing on bar 5 is the
#: **hit** — its highest high is bar 4, which is the first bar of the group `LINE` holds. The two
#: after it reach nowhere near a line and are the *silent* legs. The one closing on the last bar is
#: the **running** leg, and `TARGETED_LAST` is the line that proves it is never measured.
#:
#: Written as a climb rather than as the minimum that marks, because the marking rule reads one side
#: of a bar at a time and a fixture trimmed to four bars marks somewhere nobody predicted.
CLIMB = (
    (86.0, 87.0, 84.0, 85.0),
    (85.0, 85.5, 80.0, 81.0),
    (81.0, 86.0, 80.5, 85.0),
    (85.0, 90.0, 84.0, 89.0),
    (89.0, 100.0, 88.0, 95.0),
    (95.0, 100.0, 94.0, 96.0),
    (96.0, 97.0, 90.0, 91.0),
    (91.0, 92.0, 85.0, 86.0),
    (86.0, 87.0, 82.0, 83.0),
    (83.0, 88.0, 82.5, 87.0),
    (87.0, 92.0, 86.0, 91.0),
    (91.0, 96.0, 90.0, 95.0),
    (95.0, 97.0, 93.0, 94.0),
    (94.0, 95.0, 90.0, 91.0),
)

#: The line the **last** leg of `CLIMB` reaches: its lowest low is the final bar's, at 90.0, and this
#: line is held from above there. A target in every respect but the one that matters.
TARGETED_LAST = 90.0


def sources(
    specs: tuple[tuple[float, float, float, float], ...],
    *pins: tuple[str, int, float],
) -> tuple[list[Leg], list[LegMark], list[LineRespect]]:
    """The three Series `leg_targets` reads, all three run rather than written.

    `pins` are `(id, anchor bar, price)`. The anchor bar is skipped when a line is asked about, which
    is why the far-side line below is pinned one bar before the bar it is meant to be touched on.
    """
    bars = series(*specs)
    marks = SimpleLegPattern(reads=("5m",), emits="5m").run(
        {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    )
    legs = [Leg.anchored(leg[0], bars=tuple(leg)) for leg in split_legs(bars.points, marks.points)]
    lines = PinnedLines(
        tuple(Line(id=id, time=at(anchor), price=price) for id, anchor, price in pins)
    )
    respects = line_respects(line_relations(bars.points, lines), bars.points)

    return legs, marks.points, respects


def targets(
    specs: tuple[tuple[float, float, float, float], ...],
    *pins: tuple[str, int, float],
) -> list[tuple[str, str, str, int, int, int]]:
    """One window's targets as `(line, side, direction, extreme bar, leg start, leg end)`."""
    return [
        (
            point.line,
            point.side,
            point.direction,
            index(point.time),
            index(point.start.time),
            index(point.end.time),
        )
        for point in leg_targets(*sources(specs, *pins))
    ]


# --- the table ----------------------------------------------------------------------------------


def test_agreement_is_the_mirror_of_itself():
    """A leg that ran up is held by a line under it, and the bear reading is the vertical mirror."""
    assert AGREES == {"bullish": "below", "bearish": "above"}


# --- the rule -----------------------------------------------------------------------------------


def test_a_leg_whose_extreme_sits_in_a_group_reaches_that_line():
    """The whole of it: the bull leg's highest high is the first bar the line held on."""
    assert targets(CLIMB, ("L", 0, LINE)) == [("L", "below", "bullish", 4, 0, 5)]


def test_the_bear_twin_reads_the_same_way():
    """`flipped` around `LINE`: the leg runs down into it and the group holds it from above."""
    assert targets(flipped(CLIMB), ("L", 0, LINE)) == [("L", "above", "bearish", 4, 0, 5)]


def test_the_point_carries_the_line_price_and_the_leg_reached_it():
    """`price` is the line's and `reach` is the leg's, and on a touch they are the same number."""
    found = leg_targets(*sources(CLIMB, ("L", 0, LINE)))

    assert len(found) == 1
    assert (found[0].price, found[0].reach) == (LINE, 100.0)
    # The anchor is the extreme bar itself, so the Point's own OHLC is that bar's.
    assert (found[0].high, found[0].low) == (100.0, 88.0)


def test_a_group_on_the_far_side_is_not_a_target():
    """The bull leg's extreme bar touches `FAR` from above, and a line behind price stopped nothing."""
    legs, marks, respects = sources(CLIMB, ("F", 3, FAR))

    # The group is there and it covers the extreme bar — the filter is what drops it, not a miss.
    covering = [(group.line, group.side, index(group.time)) for group in respects]
    assert covering[0] == ("F", "above", 4)
    assert leg_targets(legs, marks, respects) == []


def test_only_the_agreeing_line_answers_when_both_are_pinned():
    """Two lines, one on each side of the same bar. One target, and it is the one price ran into."""
    assert targets(CLIMB, ("L", 0, LINE), ("F", 3, FAR)) == [("L", "below", "bullish", 4, 0, 5)]


def test_two_lines_one_leg_reached_are_two_points_on_one_bar():
    """One Point per line, not one Point carrying a list of them. Both share the anchor."""
    assert targets(CLIMB, ("A", 0, LINE), ("B", 0, LINE)) == [
        ("A", "below", "bullish", 4, 0, 5),
        ("B", "below", "bullish", 4, 0, 5),
    ]


def test_a_leg_that_reached_nothing_says_nothing():
    """Three of `CLIMB`'s four legs are measured and only one of them met the line."""
    legs, marks, respects = sources(CLIMB, ("L", 0, LINE))

    assert len(legs) == 4
    assert len(leg_targets(legs, marks, respects)) == 1


def test_no_lines_at_all_is_an_empty_answer():
    """The state of every run before anybody pinned anything."""
    assert targets(CLIMB) == []


def test_the_running_leg_is_never_measured():
    """The last leg's lowest low is held by `TARGETED_LAST`, and it is still not a target."""
    legs, marks, respects = sources(CLIMB, ("T", 12, TARGETED_LAST))

    # The group sits on the final bar, which is the last leg's extreme — so the drop is what is
    # being tested here and not an absence of anything to drop.
    assert [(group.side, index(group.time)) for group in respects] == [("above", 13)]
    assert index(legs[-1].bars[-1].time) == 13
    assert leg_targets(legs, marks, respects) == []


def test_anchors_never_go_backwards():
    """Emission order is bar order without a sort — see `leg_targets`."""
    found = leg_targets(*sources(CLIMB, ("A", 0, LINE), ("B", 0, LINE)))
    times = [point.time for point in found]

    assert times == sorted(times)


def test_a_leg_closing_where_no_mark_is_raises():
    """The mismatched-detector guard: the legs were cut at marks this Series does not have."""
    legs, marks, respects = sources(CLIMB, ("L", 0, LINE))
    without = [mark for mark in marks if index(mark.time) != 5]

    with pytest.raises(ValueError, match="different detectors"):
        leg_targets(legs, without, respects)


# --- the Pattern --------------------------------------------------------------------------------


def pipeline(*pins: tuple[str, int, float]):
    """The five Patterns a target needs, in run order, as the pipeline declares them."""
    marks = SimpleLegPattern(reads=("5m",), emits="5m")
    legs = LegPattern(source=marks, reads=("5m",), emits="5m")
    relations = LineRelationsPattern(
        lines=PinnedLines(
            tuple(Line(id=id, time=at(anchor), price=price) for id, anchor, price in pins)
        ),
        reads=("5m",),
        emits="5m",
    )
    respects = LineRespectPattern(source=relations, reads=("5m",), emits="5m")
    targets = LegTargetPattern(
        source=legs, marks=marks, respects=respects, reads=("5m",), emits="5m"
    )

    return marks, legs, relations, respects, targets


def test_the_producer_renders_all_three_sources_whole():
    """The key is derived, and every source is in it — which is what tells two instances apart."""
    *_, targets = pipeline(("L", 0, LINE))

    assert targets.producer == (
        "leg-target("
        "source=<leg(source=<simple-leg(reads=5m,emits=5m)>,reads=5m,emits=5m)>,"
        "marks=<simple-leg(reads=5m,emits=5m)>,"
        "respects=<line-respect(source=<line-relations("
        "lines=pinned,proximity=proximidade,legs=None,reads=5m,emits=5m)>,reads=5m,emits=5m)>,"
        "reads=5m,emits=5m)"
    )


def test_the_two_instances_are_told_apart_by_their_respects():
    """The pipeline declares one over the levels and one over the sloped lines."""
    marks, legs, _, levels, over_levels = pipeline(("L", 0, LINE))
    trends = TrendRelationsPattern(trends=PinnedTrends(()), reads=("5m",), emits="5m")
    over_trends = LegTargetPattern(
        source=legs,
        marks=marks,
        respects=LineRespectPattern(source=trends, reads=("5m",), emits="5m"),
        reads=("5m",),
        emits="5m",
    )

    assert over_levels.name == "Targets · Respect · Line relations"
    assert over_trends.name == "Targets · Respect · Trend relations"
    assert over_levels.producer != over_trends.producer
    assert levels.name == "Respect · Line relations"


def test_the_pattern_answers_through_a_real_engine():
    """All five keys in `ctx`, and the last one holding the target the rule found by hand above."""
    declared = pipeline(("L", 0, LINE))
    targets = declared[-1]
    ctx = PatternEngine({"5m": series(*CLIMB)}, declared).run()

    found = ctx[targets.producer]

    assert found.identity == SeriesIdentity(targets.producer, "WIN@N", "5m")
    assert [(point.line, point.side, index(point.time)) for point in found.points] == [
        ("L", "below", 4)
    ]


def test_the_pattern_answers_empty_without_lines():
    """No lines pinned is an empty Series, not a missing key — the reason `relations` is declared."""
    declared = pipeline()
    targets = declared[-1]
    ctx = PatternEngine({"5m": series(*CLIMB)}, declared).run()

    assert targets.producer in ctx
    assert not ctx[targets.producer]
