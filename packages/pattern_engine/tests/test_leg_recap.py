"""Four Series written onto one row, tested for the two things that can go wrong with a join.

There is no rule in `leg_recap` to test. Every number on a row arrived from somewhere else, so what
is under test is **alignment** — that row `j` describes leg `j` and not its neighbour — and the
**guards**, which are the only things standing between a miswired pipeline and a page of plausible
nonsense. Then the day filter, which is the one thing here that drops data.

Every source is built by **running the real upstream code**: `SimpleLegPattern` and `split_legs` for
the legs, `LegReachPattern` and `RetracementPattern` for the measurements, and `line_relations` /
`trend_relations` / `average_relations` → `line_respects` → `leg_targets` for the four kinds.
A hand-typed `Retracement` would let the test assert an alignment the real Series does not have,
which is the one claim this module makes and therefore the one thing a fixture must not be allowed
to fake.

The two averages stand in for the pipeline's `wma-30` and `wma-30-1h` as **two unbucketed averages of
different periods**, and that substitution is worth stating. An hourly bucket needs `period` closed
hours behind it — thirty-six five-minute bars for three of them — and no fixture here is that long.
What the recap claims about them is that the two Series land in two fields and never cross, which two
periods test exactly as well as two buckets; that a bucketed average has a value at all is
`test_weighted_average`'s, and that the real pair is wired the right way round is the pipeline's and is
checked against the live API.

`CLIMB` and its line prices are `test_leg_target`'s, deliberately: that file already established
which leg of this window reaches what, so the two read as one fixture seen from two sides.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, Pattern, PatternEngine, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.average_relations import (
    AverageRelationsPattern,
    average_relations,
    values_at,
)
from pattern_engine.patterns.average_respect import AverageRespectPattern
from pattern_engine.patterns.average_target import AverageTargetPattern
from pattern_engine.patterns.leg_extremes import extreme_points
from pattern_engine.patterns.leg_processor import Leg, LegPattern, split_legs
from pattern_engine.patterns.leg_reach import LegReachPattern
from pattern_engine.patterns.leg_recap import LegRecap, LegRecapPattern, leg_recaps
from pattern_engine.patterns.leg_target import LegTarget, LegTargetPattern, leg_targets
from pattern_engine.patterns.line_relations import (
    Line,
    LineRelation,
    LineRelationsPattern,
    PinnedLines,
    line_relations,
)
from pattern_engine.patterns.line_respect import LineRespectPattern, line_respects
from pattern_engine.patterns.retracement import Retracement, RetracementPattern
from pattern_engine.patterns.simple_leg import SimpleLegPattern
from pattern_engine.patterns.trend_relations import (
    PinnedTrend,
    PinnedTrends,
    TrendRelationsPattern,
    trend_relations,
)
from pattern_engine.patterns.weighted_average import WeightedAveragePattern, label
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The price of the line a leg is expected to reach. `test_leg_target`'s, and for its reason.
LINE = 100.0

#: The line the **last** leg of `CLIMB` reaches: its lowest low is the final bar's, at 90.0, held
#: from above there. A target in every respect except that nothing measures the running leg.
TARGETED_LAST = 90.0

#: Where the day splits in the two-session fixture: bars before this one belong to the session
#: before. Six, so the first leg closes on the earlier day and the second straddles the two.
SPLIT = 6

#: `CLIMB` from `test_leg_target`: four marked legs, the first running up into `LINE` twice and
#: turning away from it. Its marks land on bars 1, 5, 8, 12 and 13, so the legs close on 5, 8, 12
#: and 13 — the last of those being the newest bar rather than a mark, which is what makes that leg
#: the running one.
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


#: The periods of the two averages standing in for `wma-30` and `wma-30-1h`. Three and five rather
#: than thirty twice: an average needs `period` bars of warm-up before it says anything, and a
#: fixture short enough to read has to buy that cheaply. Two *different* periods, so a target
#: landing in the wrong field cannot pass by holding the right value.
PERIODS = (3, 5)


def pullbacks(cycles: int = 8) -> tuple[tuple[float, float, float, float], ...]:
    """A climb in threes, each run ending in a bar that wicks down through the averages.

    `CLIMB` is the wrong fixture for an average and the reason is `AGREES`. A target needs a group on
    the bar a leg made its extreme, held from the side that would have stopped the leg — and a short
    average sits just under a rising price, so its groups are held from `above` and only a **bear**
    leg can target one. `CLIMB`'s bear legs fall away from the average rather than onto it.

    So each cycle here is three bars up and then one that opens above the averages, wicks well below
    them and closes back above: a pullback marked as a `low` whose lowest low is the bar they were
    touched on. `test_average_target.window` is the same shape and for the same reason.
    """
    specs: list[tuple[float, float, float, float]] = []
    price = 100.0

    for _ in range(cycles):
        for _ in range(3):
            specs.append((price, price + 3.0, price - 0.5, price + 2.5))
            price += 2.5
        specs.append((price, price + 0.5, price - 7.0, price - 0.5))
        price -= 0.5

    return tuple(specs)


def at(index: int) -> datetime:
    """When the `index`-th bar of a five-minute window opens."""
    return OPEN + timedelta(minutes=5 * index)


def bar(open: float, high: float, low: float, close: float, index: int = 0) -> Candle:
    """One bar, `(open, high, low, close)` in the order the fixtures are written."""
    return Candle(time=at(index), open=open, high=high, low=low, close=close, volume=100.0)


def series(
    specs: tuple[tuple[float, float, float, float], ...], *, split: int = 0
) -> BaseSeries[Candle]:
    """`specs` as one window, the first `split` bars moved back a day.

    One window and two sessions, which is the only shape the day filter can be read on. Moving the
    head back rather than pushing the tail forward keeps the times increasing without a gap wide
    enough for anything upstream to notice — nothing in this chain reads a session boundary, so the
    marks land where they would have landed on one day.
    """
    return BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"),
        [
            candle if index >= split else replace(candle, time=candle.time - timedelta(days=1))
            for index, candle in enumerate(bar(*spec, index=at) for at, spec in enumerate(specs))
        ],
    )


def index(moment: datetime) -> int:
    """Which bar of the window `moment` opens, so assertions read as positions and not as clocks."""
    return round((moment - OPEN).total_seconds() // 300) % 288


def sources(
    specs: tuple[tuple[float, float, float, float], ...] = CLIMB,
    *,
    split: int = 0,
    levels: tuple[tuple[str, int, float], ...] = (),
    trends: tuple[tuple[str, int, int, float], ...] = (),
) -> tuple[
    list[Leg],
    list[Retracement],
    list[LegTarget],
    list[LegTarget],
    list[LegTarget],
    list[LegTarget],
]:
    """The six Series `leg_recaps` reads, every one of them run rather than written.

    `levels` are `(id, anchor bar, price)`; `trends` are `(id, from bar, to bar, price)` and are
    pinned flat, so a trend states the same fact a level does and the two can be told apart on the
    row by nothing but which field they landed in. The two averages need no argument — they are
    `PERIODS` over the same bars, and an average is a line nobody draws.

    The reach and the retracement go through their Patterns rather than their rule functions: what
    is under test is the alignment of `Retracement` *Points* with legs, and the positional
    `provisional` flag only exists once the adapter has run.
    """
    bars = series(specs, split=split)
    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}

    detector = SimpleLegPattern(reads=("5m",), emits="5m")
    ctx[detector.producer] = detector.run(ctx)
    reach = LegReachPattern(source=detector, reads=("5m",), emits="5m")
    ctx[reach.producer] = reach.run(ctx)
    measures = RetracementPattern(source=reach, reads=("5m",), emits="5m")

    marks = ctx[detector.producer].points
    legs = [Leg.anchored(leg[0], bars=tuple(leg)) for leg in split_legs(bars.points, marks)]

    pinned = PinnedLines(
        tuple(Line(id=id, time=bars[anchor].time, price=price) for id, anchor, price in levels)
    )
    sloped = PinnedTrends(
        tuple(
            PinnedTrend(
                id=id,
                from_time=bars[start].time,
                from_price=price,
                to_time=bars[end].time,
                to_price=price,
            )
            for id, start, end, price in trends
        )
    )

    def against(relations: list[LineRelation]) -> list[LegTarget]:
        """One kind of line's events, grouped and then met against the legs."""
        return leg_targets(legs, marks, line_respects(relations, bars.points))

    def average(period: int) -> list[LineRelation]:
        """An unbucketed average of `period`, and what every bar did about it.

        Through `WeightedAveragePattern` rather than a hand-written list of values, so the warm-up
        and the `line` id are the real ones — `average_relations` labels its answers with the
        average's own name, and a target's `line` is how a row is read back to the average it names.
        """
        wma = WeightedAveragePattern(period=period, reads=("5m",), emits="5m")
        return average_relations(
            bars.points, values_at(bars.points, wma.run(ctx).points), wma.name
        )

    return (
        legs,
        list(measures.run(ctx).points),
        against(line_relations(bars.points, pinned)),
        against(trend_relations(bars.points, sloped)),
        against(average(PERIODS[0])),
        against(average(PERIODS[1])),
    )


def recaps(**kwargs: object) -> list[LegRecap]:
    """One window's rows."""
    return leg_recaps(*sources(**kwargs))  # type: ignore[arg-type]



def spans(rows: list[LegRecap]) -> list[tuple[int, int]]:
    """Each row as `(first bar, last bar)`, so a sequence of legs reads as a sequence."""
    return [(index(row.time), index(row.end.time)) for row in rows]


# --- the alignment ------------------------------------------------------------------------------


def test_one_row_per_leg_in_leg_order():
    """The Series is the sequence: four legs of `CLIMB`, in the order `split_legs` cut them."""
    assert spans(recaps()) == [(0, 5), (5, 8), (8, 12), (12, 13)]


def test_each_row_carries_its_own_leg_and_its_own_measurement():
    """Row `j` is leg `j` and retracement `j` — the one claim this module makes."""
    legs, measures, *targets = sources()
    rows = leg_recaps(legs, measures, *targets)

    assert len(rows) == len(legs) == len(measures)
    for row, leg, measure in zip(rows, legs, measures):
        assert row.bars == leg.bars
        assert row.measured is measure.measured
        assert row.provisional == measure.provisional


def test_the_direction_is_the_closing_pivots_side_translated():
    """A leg closing on a high ran up. The bull/bear vocabulary, as `leg-target` reads it."""
    _, measures, *_ = sources()

    assert [measure.direction for measure in measures] == ["high", "low", "high", "low"]
    assert [row.direction for row in recaps()] == ["bullish", "bearish", "bullish", "bearish"]


def test_the_reach_is_the_first_of_the_three_readings_over_the_legs_own_bars():
    """Carried whole, so the bar the level was made on is on the row beside the price."""
    rows = recaps()
    first = rows[0]

    assert first.reach == extreme_points(first.bars, "bullish")[0]
    assert (first.reach.type, first.reach.price, index(first.reach.time)) == ("reach", 100.0, 4)


# --- the pinned kinds of hit -----------------------------------------------------------------------


def test_a_level_a_leg_reached_lands_in_levels_and_a_trend_in_trends():
    """Two lines saying the same thing, told apart by nothing but the field they arrive in."""
    rows = recaps(levels=(("L", 0, LINE),), trends=(("T", 0, 13, LINE),))

    assert [target.line for target in rows[0].levels] == ["L"]
    assert [target.line for target in rows[0].trends] == ["T"]
    # And the target names the leg its row does — the join is the leg's closing bar.
    assert rows[0].levels[0].end.time == rows[0].end.time


def test_a_leg_that_reached_nothing_carries_two_empty_tuples():
    """Both lines are up at `LINE`, and the legs after the first go nowhere near it."""
    rows = recaps(levels=(("L", 0, LINE),), trends=(("T", 0, 13, LINE),))

    assert [(row.levels, row.trends) for row in rows[1:]] == [((), ())] * 3


def test_several_lines_one_leg_reached_are_several_targets_on_one_row():
    """One Point per line upstream, and the row holds them all rather than choosing."""
    rows = recaps(levels=(("L", 0, LINE), ("M", 1, LINE)))

    assert sorted(target.line for target in rows[0].levels) == ["L", "M"]


def test_the_running_leg_is_provisional_and_holds_no_target_it_reached():
    """`TARGETED_LAST` sits on the last leg's extreme, and nothing measured that leg.

    The whole cost of emitting it untrimmed, in one assertion: empty here means *not measured*, and
    `provisional` is the only thing that says so.
    """
    rows = recaps(levels=(("P", 0, TARGETED_LAST),))
    last = rows[-1]

    assert last.provisional is True
    assert (last.levels, last.trends) == ((), ())
    assert [row.provisional for row in rows[:-1]] == [False, False, False]


def test_rows_arrive_with_no_lines_at_all():
    """The legs and the retracements do not need a line, so the sequence is there without one."""
    rows = recaps()

    assert len(rows) == 4
    assert all((row.levels, row.trends) == ((), ()) for row in rows)


# --- the averages -------------------------------------------------------------------------------


def test_a_leg_that_reached_an_average_lands_in_averages():
    """`pullbacks` ends each run on the bar the averages were touched on, and those are bear legs."""
    rows = recaps(specs=pullbacks())
    hit = [row for row in rows if row.averages]

    assert hit
    assert all(row.direction == "bearish" for row in hit)
    # The target names the leg its row does — the join is the leg's closing bar, as for a level.
    assert all(row.averages[0].end.time == row.end.time for row in hit)


def test_each_average_lands_in_its_own_field_and_never_the_other():
    """Two periods, two fields. A target in the wrong one would hold the wrong average's name."""
    rows = recaps(specs=pullbacks())
    slow, fast = label(PERIODS[0], None), label(PERIODS[1], None)

    assert {target.line for row in rows for target in row.averages} == {slow}
    assert {target.line for row in rows for target in row.hourly_averages} == {fast}


def test_no_row_holds_more_than_one_target_per_average():
    """An average's Series carries one line, and a line's groups are disjoint. See the docstring."""
    rows = recaps(specs=pullbacks())

    assert max(len(row.averages) for row in rows) == 1
    assert max(len(row.hourly_averages) for row in rows) == 1


def test_a_leg_that_reached_neither_average_carries_two_empty_tuples():
    """The bull legs of `pullbacks` run away from the averages rather than onto them."""
    rows = recaps(specs=pullbacks())
    missed = [row for row in rows if row.direction == "bullish" and not row.provisional]

    assert missed
    assert all((row.averages, row.hourly_averages) == ((), ()) for row in missed)


def test_the_averages_arrive_without_a_pinned_line():
    """The whole behavioural claim of the new producer name, stated on the row that carries it.

    `levels` and `trends` are empty because nothing was pinned; the two average fields are filled
    anyway, because the line they are about is arithmetic over closes. A row off the automatic run is
    therefore right about four of its six readings, which is the asymmetry the web app's `PARTIAL`
    set exists to handle: show this copy, and replace it the moment a run with lines answers.
    """
    rows = recaps(specs=pullbacks())

    assert all((row.levels, row.trends) == ((), ()) for row in rows)
    assert any(row.averages or row.hourly_averages for row in rows)


# --- the day ------------------------------------------------------------------------------------


def test_only_the_newest_days_legs_are_rows():
    """`SPLIT` puts the first leg wholly on the session before, and it is not a row."""
    assert spans(recaps(split=SPLIT)) == [(5, 8), (8, 12), (12, 13)]


def test_a_leg_that_opened_on_the_session_before_is_still_the_days_leg():
    """The leg from bar 5 to 8 straddles the split and is kept — any bar on the day counts."""
    rows = recaps(split=SPLIT)
    first = rows[0]

    assert first.time.date() < first.end.time.date()
    assert first.bars[0].time == first.time


def test_a_target_on_a_dropped_leg_goes_with_it():
    """The day filter is the last word: the level the first leg reached is not on any row."""
    rows = recaps(split=SPLIT, levels=(("L", 0, LINE),))

    assert all(row.levels == () for row in rows)


# --- the guards ---------------------------------------------------------------------------------


def test_no_legs_is_no_rows():
    assert leg_recaps([], [], [], [], [], []) == []


def test_a_single_leg_with_no_measurement_is_the_one_mark_case_and_emits_nothing():
    """`split_legs` answers one leg for a window holding one mark; `retracements` answers none.

    That leg is the head fold with nothing on either side of it, and a row of absences would claim
    it was measured and came back empty.
    """
    legs, *_ = sources()

    assert leg_recaps(legs[:1], [], [], [], [], []) == []


def test_any_other_count_mismatch_raises():
    """Two dense Series disagreeing about how many legs there are can only be two detectors."""
    legs, measures, *_ = sources()

    with pytest.raises(ValueError, match="4 legs against 3 retracements"):
        leg_recaps(legs, measures[:-1], [], [], [], [])


# --- the Pattern --------------------------------------------------------------------------------


def patterns() -> tuple[Pattern, ...]:
    """The four sources and the recap, declared in run order as a pipeline would."""
    detector = SimpleLegPattern(reads=("5m",), emits="5m")
    reach = LegReachPattern(source=detector, reads=("5m",), emits="5m")
    measures = RetracementPattern(source=reach, reads=("5m",), emits="5m")
    slicer = LegPattern(source=detector, reads=("5m",), emits="5m")
    relations = LineRelationsPattern(
        lines=PinnedLines((Line(id="L", time=OPEN, price=LINE),)), legs=slicer,
        reads=("5m",), emits="5m",
    )
    sloped = TrendRelationsPattern(trends=PinnedTrends(()), legs=slicer, reads=("5m",), emits="5m")
    level_respects = LineRespectPattern(source=relations, reads=("5m",), emits="5m")
    trend_respects = LineRespectPattern(source=sloped, reads=("5m",), emits="5m")
    level_targets = LegTargetPattern(
        source=slicer, marks=detector, respects=level_respects, reads=("5m",), emits="5m"
    )
    trend_targets = LegTargetPattern(
        source=slicer, marks=detector, respects=trend_respects, reads=("5m",), emits="5m"
    )
    averages = [
        WeightedAveragePattern(period=period, reads=("5m",), emits="5m") for period in PERIODS
    ]
    average_relations_ = [
        AverageRelationsPattern(source=wma, reads=("5m",), emits="5m") for wma in averages
    ]
    average_respects = [
        AverageRespectPattern(source=source, reads=("5m",), emits="5m")
        for source in average_relations_
    ]
    average_targets = [
        AverageTargetPattern(
            source=slicer, marks=detector, respects=respects, reads=("5m",), emits="5m"
        )
        for respects in average_respects
    ]
    recap = LegRecapPattern(
        source=slicer,
        measures=measures,
        levels=level_targets,
        trends=trend_targets,
        averages=average_targets[0],
        hourly_averages=average_targets[1],
        reads=("5m",),
        emits="5m",
    )

    return (
        detector, reach, measures, slicer, relations, sloped,
        level_respects, trend_respects, level_targets, trend_targets,
        *averages, *average_relations_, *average_respects, *average_targets, recap,
    )


def test_the_producer_names_all_six_sources():
    """Every source renders whole into the key, so two recaps over two chains cannot collide.

    Composed from the sources rather than transcribed: the literal runs to thousands of characters of
    nesting, and a test nobody can read is a test nobody will correct. What is asserted is the same
    thing `test_leg_target` asserts of its shorter key — that the six are *in* there, each as its own
    producer, in signature order, and that nothing else is.
    """
    declared = patterns()
    _, _, measures, slicer, *_ = declared
    level_targets, trend_targets = declared[8], declared[9]
    averages, hourly = declared[-3], declared[-2]
    recap = declared[-1]

    assert recap.producer == (
        f"leg-recap(source=<{slicer.producer}>,measures=<{measures.producer}>,"
        f"levels=<{level_targets.producer}>,trends=<{trend_targets.producer}>,"
        f"averages=<{averages.producer}>,hourly_averages=<{hourly.producer}>,"
        "reads=5m,emits=5m)"
    )
    # And the two averages are told apart inside it, which is what stops one key answering for both.
    assert averages.producer != hourly.producer


def test_the_whole_chain_through_an_engine():
    """Eleven Patterns in declaration order, and the recap answers with the level on the first row."""
    declared = patterns()
    engine = PatternEngine({"5m": series(CLIMB)}, declared)

    found = engine.run()[declared[-1].producer]

    assert spans(list(found.points)) == [(0, 5), (5, 8), (8, 12), (12, 13)]
    assert [target.line for target in found[0].levels] == ["L"]
    assert found.identity.timeframe == "5m"
