"""The four kinds asked of an average, tested against the module they are borrowed from.

The first test is the load-bearing one and it is an equality, not an example: over a window where a
level and an average sit at the same price on the same bars, `average_relations` must answer
`line_relations` **Point for Point, field for field**. That is the whole claim of this module — the
rules are not new — and any drift in it would show up there before it showed up in a reading of the
chart. Everything after it is about the two things that *are* new: that nothing is skipped for being
an anchor, and that the line is silent through its warm-up.

Then the plumbing, which is small and has two ways to be wrong: `values_at` joins the average to the
bars on `time`, because the two sequences are not parallel, and `resolver` is bounds-checked because
the driver walks the window rather than the list.

Then the Pattern through a real engine, with a real `WeightedAveragePattern` in front of it — where
the ordering constraint is pinned, in the words `pipeline.py` is written in: declared before its
source, it writes nothing.

The fixtures keep the *line price at 100.0* wherever a level and an average are being compared, the
idiom `test_line_relations` uses and for its reason: an assertion should carry an argument about
where the bar was, not about where the line was.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.average_relations import (
    AverageRelationsPattern,
    average_relations,
    resolver,
    values_at,
)
from pattern_engine.patterns.line_relations import Line, PinnedLines, line_relations
from pattern_engine.patterns.proximity import NO_PROXIMITY, ProximityLevel, ProximityRule
from pattern_engine.patterns.weighted_average import WeightedAverage, WeightedAveragePattern
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The price the level and the average share in the comparison cases. See the module docstring.
LINE = 100.0

#: What the average is called in the cases that do not build a real one. Short, because it is read
#: as an id — see `weighted_average.label`.
NAME = "wma-3"


def at(index: int) -> datetime:
    """When the `index`-th bar of a five-minute window opens."""
    return OPEN + timedelta(minutes=5 * index)


def bar(open: float, high: float, low: float, close: float, index: int = 0) -> Candle:
    """One bar, `(open, high, low, close)` in the order the fixtures are written."""
    return Candle(time=at(index), open=open, high=high, low=low, close=close, volume=100.0)


def bars(*specs: tuple[float, float, float, float]) -> list[Candle]:
    return [bar(*spec, index=index) for index, spec in enumerate(specs)]


def series(*specs: tuple[float, float, float, float]) -> BaseSeries[Candle]:
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars(*specs))


def spans(*values: float | None) -> list[float | None]:
    """A leg span per bar, written out — what `leg_spans` computes and these cases assume."""
    return list(values)


def kinds(found: list) -> list[tuple[int, str, str | None, str | None]]:
    """A run's Points as `(bar index, kind, wick, side)` — what every assertion below reads."""
    return [
        (round((point.time - OPEN).total_seconds() // 300), point.kind, point.wick, point.side)
        for point in found
    ]


#: Four bars around a line at 100: a touch from below, a breakout up, a seam back down, then a bar
#: that stopped seven points short of it. Bar 0 is the level's anchor and the average's warm-up, so
#: the two modules are asked about bars 1 to 4 either way — which is what makes them comparable.
AROUND = (
    (94.0, 96.0, 93.0, 95.0),
    (97.0, 100.5, 96.0, 98.0),
    (99.0, 103.0, 98.0, 102.0),
    (101.0, 102.0, 97.0, 98.0),
    (90.0, 93.0, 89.0, 92.0),
)

#: The reach a hundred-point leg is granted at a tenth: ten points, and ten on the tick grid too.
#: Seven short is inside it, which is what makes the last bar of `AROUND` a `close`. A hundred and
#: not fifty because the reach is rounded to a five-point tick — the arithmetic
#: `test_line_relations` explains at `STOPPED_SHORT`, and under a fifty-point leg this bar is out.
NEAR = ProximityRule(name="proximidade", levels=(ProximityLevel(points=10.0, trigger=0.1),))


def flat(count: int, first: float | None = None) -> list[float | None]:
    """An average worth `LINE` on every bar but the first, which is its warm-up.

    One bar of warm-up rather than none, so a level anchored on bar 0 and this average are silent
    about exactly the same bar — the one thing that has to be true for the comparison below to be
    about the rules rather than about the window.
    """
    return [first] + [LINE] * (count - 1)


# --- the same rules ------------------------------------------------------------------------------


def test_an_average_sitting_where_a_level_sits_answers_what_the_level_answers() -> None:
    """The claim of this module, as an equality over all four kinds.

    Same bars, same price on every bar asked about, same proximity ladder and the same leg spans —
    and therefore the same Points, down to `gap`, `leg`, `since` and the inherited OHLCV. The only
    field that could differ is `line`, and the level is pinned under the average's own name so that
    it does not.
    """
    window = bars(*AROUND)
    leg = spans(*[100.0] * len(window))

    level = line_relations(
        window,
        PinnedLines((Line(id=NAME, time=at(0), price=LINE),)),
        NEAR,
        leg,
    )
    average = average_relations(window, flat(len(window)), NAME, NEAR, leg)

    assert kinds(level) == [
        (1, "touch", "high", "below"),
        (2, "breakout", None, "below"),
        (3, "seam", None, "above"),
        (4, "close", None, "below"),
    ]
    assert average == level


def test_without_a_rule_the_three_kinds_are_the_level_s_three() -> None:
    """The near miss off, and the equality holds as it did — the driver's own default, reached here."""
    window = bars(*AROUND)
    level = line_relations(window, PinnedLines((Line(id=NAME, time=at(0), price=LINE),)))

    assert average_relations(window, flat(len(window)), NAME) == level
    assert "close" not in {point.kind for point in level}


# --- what is new ---------------------------------------------------------------------------------


def test_the_first_bar_the_average_answers_on_is_asked_in_full() -> None:
    """No anchor bar, so nothing is skipped for being one — the `quiet = -1` choice, under test.

    The average is worth 100 from bar 0 onward and bar 0 touches it. A level cannot be asked about
    its own anchor, and that is right for a level; here there is no bar that made the line, so a
    bar silenced at the start would be a reading thrown away for a reason that does not apply.
    """
    window = bars((97.0, 100.5, 96.0, 98.0), (98.0, 99.0, 97.0, 98.5))
    found = average_relations(window, [LINE, LINE], NAME)

    assert kinds(found) == [(0, "touch", "high", "below")]


def test_the_warm_up_bars_are_silent_whatever_they_did() -> None:
    """`None` is the only thing that keeps a bar out, and it says "no line yet" rather than "skip".

    The first two bars cross the price the average later settles at, and neither is reported: there
    was no average on them to cross. The third is the same bar as the first and is reported.
    """
    crossing = (97.0, 103.0, 96.0, 102.0)
    window = bars(crossing, crossing, crossing)
    found = average_relations(window, [None, None, LINE], NAME)

    assert kinds(found) == [(2, "breakout", None, "below")]


def test_an_average_that_never_answered_is_an_empty_run() -> None:
    """A window shorter than the period reaches here as all-`None`, and that is not an error."""
    window = bars(*AROUND)
    assert average_relations(window, [None] * len(window), NAME) == []
    assert average_relations([], [], NAME) == []


def test_every_point_is_labelled_with_the_name_it_was_given() -> None:
    """`line` is the average's own name here — there is no browser to have minted an id."""
    found = average_relations(bars(*AROUND), flat(len(AROUND)), "wma-30-1h", NEAR, spans(*[100.0] * 5))
    assert {point.line for point in found} == {"wma-30-1h"}


def test_the_same_bar_answers_differently_as_the_line_moves_through_it() -> None:
    """Where the line sits decides the kind, and here the line is what moved — twice, over one bar.

    The identical bar twice: opens at 96, runs to 103, closes at 101. Under an average worth 100 it
    opened below and closed above, which is a breakout. Under one worth 102 it never got there with
    its close and only its upper wick reached, which is a touch. Nothing about either bar differs,
    which is the case a level cannot produce and the one a reader has to hold in mind here.
    """
    window = bars((96.0, 103.0, 95.0, 101.0), (96.0, 103.0, 95.0, 101.0))
    found = average_relations(window, [100.0, 102.0], NAME)

    assert kinds(found) == [(0, "breakout", None, "below"), (1, "touch", "high", "below")]
    assert [point.price for point in found] == [100.0, 102.0]


# --- the plumbing --------------------------------------------------------------------------------


def test_the_values_are_joined_to_the_bars_by_time() -> None:
    """An average is left-truncated by its warm-up, so a positional read would quote it too early."""
    window = bars(*AROUND)
    average = [
        WeightedAverage.anchored(window[3], value=111.0),
        WeightedAverage.anchored(window[4], value=222.0),
    ]

    assert values_at(window, average) == [None, None, None, 111.0, 222.0]


def test_a_value_on_a_bar_outside_the_window_is_dropped_rather_than_misplaced() -> None:
    """The reading `line_relations` gives a pin whose bar has scrolled away, arrived at by join."""
    window = bars(*AROUND[:2])
    outside = [WeightedAverage.anchored(bar(1.0, 1.0, 1.0, 1.0, index=9), value=111.0)]

    assert values_at(window, outside) == [None, None]


def test_the_resolver_is_silent_past_both_ends_of_what_it_was_handed() -> None:
    """The driver walks the bars, not the list, and a caller may hand a shorter one."""
    price = resolver([None, 100.0])

    assert (price(-1), price(0), price(1), price(2)) == (None, None, 100.0, None)


# --- the Pattern ---------------------------------------------------------------------------------


def rising(count: int) -> BaseSeries[Candle]:
    """A window that trends up, so a real average has something to be crossed by."""
    return series(
        *[
            (100.0 + i, 101.5 + i, 98.5 + i, 100.5 + i) if i % 3 else (100.0 + i, 101.0 + i, 97.0 + i, 98.0 + i)
            for i in range(count)
        ]
    )


def test_the_producer_key_names_the_average_it_asked_about() -> None:
    """Two averages are two Series, and the key is what keeps them apart — via the source's own key."""
    plain = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    hourly = WeightedAveragePattern(period=3, bucket="1h", reads=("5m",), emits="5m")

    pattern = AverageRelationsPattern(source=plain, reads=("5m",), emits="5m")
    other = AverageRelationsPattern(source=hourly, reads=("5m",), emits="5m")

    assert pattern.producer == (
        "average-relations(source=<weighted-average(period=3,bucket=None,reads=5m,emits=5m)>,"
        "proximity=proximidade,legs=None,reads=5m,emits=5m)"
    )
    assert pattern.producer != other.producer
    assert pattern.name == "Relations · wma-3"


def test_the_pattern_reads_its_average_and_answers_about_it() -> None:
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    pattern = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")
    window = rising(12)

    ctx = PatternEngine({"5m": window}, (average, pattern)).run()
    found = ctx[pattern.producer]

    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert found
    assert {point.line for point in found.points} == {"wma-3"}
    # The same answer the function gives when handed the same two lists by hand — nothing about the
    # Pattern beyond reading `ctx` and naming the Series.
    assert list(found.points) == average_relations(
        window.points,
        values_at(window.points, ctx[average.producer].points),
        "wma-3",
    )


def test_declared_before_its_average_it_writes_nothing() -> None:
    """Declaration order is run order, and there is no dependency graph — ADR-0004's case."""
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    pattern = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")

    ctx = PatternEngine({"5m": rising(12)}, (pattern, average)).run()

    assert pattern.producer not in ctx
    assert average.producer in ctx


def test_a_window_too_short_for_the_average_is_an_empty_series() -> None:
    """Empty and present, not missing: "the average never started" is not "the Pattern failed"."""
    average = WeightedAveragePattern(period=30, reads=("5m",), emits="5m")
    pattern = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")

    ctx = PatternEngine({"5m": rising(6)}, (average, pattern)).run()

    assert pattern.producer in ctx
    assert not ctx[pattern.producer]


def test_the_near_miss_needs_the_legs_the_way_its_siblings_do() -> None:
    """`proximity` with no `legs` builds no spans, so the fourth kind stays off.

    Not a special case here — it is `spans_from`'s behaviour, shared with both pinned-line Patterns,
    and worth pinning once at this Pattern's door so a future `legs` wiring has something to break.
    """
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    pattern = AverageRelationsPattern(
        source=average, proximity=NEAR, reads=("5m",), emits="5m"
    )

    ctx = PatternEngine({"5m": rising(12)}, (average, pattern)).run()

    assert "close" not in {point.kind for point in ctx[pattern.producer].points}


def test_the_proximity_rule_does_not_move_the_key() -> None:
    """`ProximityRule.__str__` answers a constant, so a ladder does not rename the Series.

    The same property `line-relations` depends on, and it has to hold here too: the browser may send
    a ladder, and a key that moved with it would make the response's own keys unpredictable.
    """
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    plain = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")
    laddered = AverageRelationsPattern(
        source=average, proximity=NEAR, reads=("5m",), emits="5m"
    )

    assert plain.producer == laddered.producer
    assert NO_PROXIMITY.name == NEAR.name


@pytest.mark.parametrize("period", [2, 3, 5])
def test_the_pattern_answers_about_the_line_the_average_actually_drew(period: int) -> None:
    """Every Point's `price` is the average's value on that bar — the claim a reader checks by eye.

    Cheap, and it is the join and the resolver tested through the Pattern rather than beside it: a
    Point quoting a `price` from the wrong bar is exactly what a positional read would produce, and
    it would still look like a plausible crossing.
    """
    average = WeightedAveragePattern(period=period, reads=("5m",), emits="5m")
    pattern = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")
    ctx = PatternEngine({"5m": rising(20)}, (average, pattern)).run()

    values = {point.time: point.value for point in ctx[average.producer].points}
    assert ctx[pattern.producer]
    for point in ctx[pattern.producer].points:
        assert point.price == values[point.time]
