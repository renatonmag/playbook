"""`AverageTargetPattern` — one class with no body, so one thing to test: that the name differs.

`test_average_respect` is this file one Series earlier, and its reasoning holds unchanged: everything
about the behaviour is `LegTargetPattern`'s and is tested in `test_leg_target`, so re-testing the join
here would be asserting that Python's inheritance works and would go stale as a second copy of those
fixtures the first time the rule changed.

What is worth pinning is the reason the class exists, which is not a behaviour and so would survive
every test in that file: the producer's class part has to read `average-target`, because `MANUAL` in
the web app is keyed by exactly that string and `leg-target` is in it — which would take this Series
off a `POST` the monitor does not send unless a level is pinned, for an answer about an average that
has nothing to do with one. And the targets it finds have to be, Point for Point, the ones the parent
finds over the same legs and the same groups, or the subclass has quietly become a second
implementation.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.average_relations import AverageRelationsPattern
from pattern_engine.patterns.average_respect import AverageRespectPattern
from pattern_engine.patterns.average_target import AverageTargetPattern
from pattern_engine.patterns.leg_processor import LegPattern
from pattern_engine.patterns.leg_target import LegTargetPattern
from pattern_engine.patterns.simple_leg import SimpleLegPattern
from pattern_engine.patterns.weighted_average import WeightedAveragePattern
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def window(cycles: int = 8) -> BaseSeries[Candle]:
    """A climb in threes, each leg ending in a bar that wicks down through the average.

    Not `test_average_respect`'s steady ladder, and the difference is the point: that file needed
    groups to form, and a target needs a group **on the bar a leg made its extreme**, held from the
    side that would have stopped the leg. A monotone climb never gives one — price sits above the
    average throughout, so every group is held from `above`, and `AGREES` wants `below` for the bull
    legs a climb is made of.

    So each cycle here is three bars up and then one that opens above the average, wicks well below
    it and closes back above: a pullback, marked as a `low`, whose lowest low is the bar the average
    was touched on. That is a bear leg reaching a line held from `above`, which is a target.
    """
    specs: list[tuple[float, float, float, float]] = []
    price = 100.0

    for _ in range(cycles):
        for _ in range(3):
            specs.append((price, price + 3.0, price - 0.5, price + 2.5))
            price += 2.5
        specs.append((price, price + 0.5, price - 7.0, price - 0.5))
        price -= 0.5

    points = [
        Candle(
            time=OPEN + timedelta(minutes=5 * index),
            open=open_,
            high=high,
            low=low,
            close=close,
            volume=100.0,
        )
        for index, (open_, high, low, close) in enumerate(specs)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), points)


def chain() -> tuple[
    WeightedAveragePattern,
    AverageRelationsPattern,
    AverageRespectPattern,
    SimpleLegPattern,
    LegPattern,
]:
    """Everything a target over an average needs, in run order."""
    average = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    relations = AverageRelationsPattern(source=average, reads=("5m",), emits="5m")
    respects = AverageRespectPattern(source=relations, reads=("5m",), emits="5m")
    detector = SimpleLegPattern(reads=("5m",), emits="5m")
    legs = LegPattern(source=detector, reads=("5m",), emits="5m")

    return average, relations, respects, detector, legs


def test_the_producer_name_is_its_own_and_not_the_legs() -> None:
    """The one thing this class is for. See the module docstring, and `manual-series.ts`."""
    *_, respects, detector, legs = chain()
    mine = AverageTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )
    theirs = LegTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )

    assert mine.producer.startswith("average-target(")
    assert theirs.producer.startswith("leg-target(")
    assert mine.producer != theirs.producer
    # The parameters render identically — only the class part differs, which is the whole change.
    assert mine.producer.removeprefix("average-target") == theirs.producer.removeprefix("leg-target")
    # `name` is inherited whole, so the chain reads back to the average it is about.
    assert mine.name == "Targets · Respect · Relations · wma-3"


def test_it_finds_exactly_what_its_parent_finds() -> None:
    """No behaviour added: the same legs and groups in, the same Points out, under a different key."""
    average, relations, respects, detector, legs = chain()
    mine = AverageTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )
    theirs = LegTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )

    declared = (average, relations, respects, detector, legs, mine, theirs)
    ctx = PatternEngine({"5m": window()}, declared).run()

    # A fixture that found nothing would pass the comparison below and prove nothing.
    assert ctx[mine.producer]
    assert list(ctx[mine.producer].points) == list(ctx[theirs.producer].points)
    assert ctx[mine.producer].identity == SeriesIdentity(mine.producer, "WIN@N", "5m")


def test_every_target_names_the_average_rather_than_a_pinned_line() -> None:
    """`line` is the average's own name here — there is no browser to have minted an id."""
    average, relations, respects, detector, legs = chain()
    targets = AverageTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )

    found = PatternEngine(
        {"5m": window()}, (average, relations, respects, detector, legs, targets)
    ).run()[targets.producer]

    assert {point.line for point in found.points} == {"wma-3"}


def test_declared_before_its_respects_it_writes_nothing() -> None:
    """The parent's ordering constraint, inherited along with everything else."""
    average, relations, respects, detector, legs = chain()
    targets = AverageTargetPattern(
        source=legs, marks=detector, respects=respects, reads=("5m",), emits="5m"
    )

    ctx = PatternEngine(
        {"5m": window()}, (average, relations, detector, legs, targets, respects)
    ).run()

    assert targets.producer not in ctx
    assert respects.producer in ctx
