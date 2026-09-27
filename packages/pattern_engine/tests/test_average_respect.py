"""`AverageRespectPattern` — one class with no body, so one thing to test: that the name differs.

Everything else about it is `LineRespectPattern`'s and is tested in `test_line_respect`. Re-testing
the grouping here would be asserting that Python's inheritance works, and would go stale as a second
copy of those fixtures the first time the rule changed.

What is worth pinning is the reason the class exists at all, which is not a behaviour and so would
survive every test in that file: the producer's class part has to read `average-respect`, because
three sets in the web app are keyed by exactly that string and one of them — `MANUAL` — would
otherwise take this Series off a `POST` that a run about an average never sends. And the groups it
produces have to be, Point for Point, the ones the parent produces over the same events, or the
subclass has quietly become a second implementation.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.average_relations import AverageRelationsPattern
from pattern_engine.patterns.average_respect import AverageRespectPattern
from pattern_engine.patterns.line_respect import LineRespectPattern
from pattern_engine.patterns.weighted_average import WeightedAveragePattern
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def window(count: int = 20) -> BaseSeries[Candle]:
    """Bars that trend up in steps, so a short average is crossed repeatedly and groups form."""
    points = [
        Candle(
            time=OPEN + timedelta(minutes=5 * index),
            open=100.0 + index,
            high=101.5 + index,
            low=98.5 + index if index % 3 else 97.0 + index,
            close=100.5 + index if index % 3 else 98.0 + index,
            volume=100.0,
        )
        for index in range(count)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), points)


def pipeline() -> tuple[WeightedAveragePattern, AverageRelationsPattern]:
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    return average, AverageRelationsPattern(source=average, reads=("5m",), emits="5m")


def test_the_producer_name_is_its_own_and_not_the_line_s() -> None:
    """The one thing this class is for. See the module docstring, and `manual-series.ts`."""
    average, relations = pipeline()
    mine = AverageRespectPattern(source=relations, reads=("5m",), emits="5m")
    theirs = LineRespectPattern(source=relations, reads=("5m",), emits="5m")

    assert mine.producer.startswith("average-respect(")
    assert theirs.producer.startswith("line-respect(")
    assert mine.producer != theirs.producer
    # The parameters render identically — only the class part differs, which is the whole change.
    assert mine.producer.removeprefix("average-respect") == theirs.producer.removeprefix(
        "line-respect"
    )
    assert mine.name == "Respect · Relations · wma-3"


def test_it_groups_exactly_what_its_parent_groups() -> None:
    """No behaviour added: the same events in, the same Points out, under a different key."""
    average, relations = pipeline()
    mine = AverageRespectPattern(source=relations, reads=("5m",), emits="5m")
    theirs = LineRespectPattern(source=relations, reads=("5m",), emits="5m")

    bars = window()
    ctx = PatternEngine({"5m": bars}, (average, relations, mine, theirs)).run()

    assert ctx[mine.producer]
    assert list(ctx[mine.producer].points) == list(ctx[theirs.producer].points)
    assert ctx[mine.producer].identity == SeriesIdentity(mine.producer, "WIN@N", "5m")


def test_declared_before_its_relations_it_writes_nothing() -> None:
    """The parent's ordering constraint, inherited along with everything else."""
    average, relations = pipeline()
    respect = AverageRespectPattern(source=relations, reads=("5m",), emits="5m")

    ctx = PatternEngine({"5m": window()}, (average, respect, relations)).run()

    assert respect.producer not in ctx
    assert relations.producer in ctx
