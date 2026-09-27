"""The weighted average, tested in three layers.

The arithmetic first, against the formula written out by hand: `Σ k·close / (N(N+1)/2)` over three
closes is a number anybody can check, and pinning it is what stops the two rolling sums from drifting
into a different average that still looks plausible.

Then the two properties that the rolling spelling is *for*, and that no single-value assertion would
catch. **Causality** — the value on a bar is what the same function answers when handed only the
bars up to it — is the no-look-ahead rule expressed as an equality, and it is the strongest
assertion in this file. **Bucket equivalence** — asking for five-minute buckets on five-minute bars
answers exactly what asking for no buckets does — is why there is one function here and not two.

Then the Pattern, where the producer key is pinned. That key must move with the period, which is the
opposite of the property `test_line_relations` pins for its own: two averages in one pipeline are two
Series, and a key that ignored the period would silently give one of them the other's answers.

The fixtures name closes and leave the rest of each bar alone — only closes are read — so a spec here
is `(open, high, low, close)` with the first three set wide enough to be uninteresting.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.weighted_average import (
    WeightedAverage,
    WeightedAveragePattern,
    label,
    weighted_average,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: One hour of five-minute bars. Written out because the bucket cases count on it.
PER_HOUR = 12


def at(index: int) -> datetime:
    """When the `index`-th bar of a five-minute window opens."""
    return OPEN + timedelta(minutes=5 * index)


def closing(close: float, index: int = 0) -> Candle:
    """One bar with the close that matters and a body wide enough to be beside the point."""
    return Candle(
        time=at(index),
        open=close,
        high=close + 1.0,
        low=close - 1.0,
        close=close,
        volume=100.0,
    )


def bars(*closes: float) -> list[Candle]:
    return [closing(close, index=index) for index, close in enumerate(closes)]


def series(*closes: float) -> BaseSeries[Candle]:
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars(*closes))


def values(found: list[WeightedAverage]) -> list[tuple[int, float]]:
    """A run's Points as `(bar index, value)` — what most assertions below read."""
    return [
        (round((point.time - OPEN).total_seconds() // 300), point.value) for point in found
    ]


def rising(count: int) -> list[float]:
    """`count` closes that never repeat, so no assertion can pass on a coincidence of equal bars."""
    return [100.0 + index * 1.5 for index in range(count)]


# --- the arithmetic -----------------------------------------------------------------------------


def test_the_average_is_the_weights_written_out() -> None:
    """Three closes, the newest weighted three: `(1 + 2*2 + 3*3) / 6`."""
    assert values(weighted_average(bars(1.0, 2.0, 3.0), 3)) == [(2, 14 / 6)]


def test_the_first_point_is_the_period_th_bar_and_every_bar_after_has_one() -> None:
    found = weighted_average(bars(*rising(10)), 4)
    assert [index for index, _ in values(found)] == [3, 4, 5, 6, 7, 8, 9]


def test_a_window_shorter_than_the_period_answers_nothing() -> None:
    assert weighted_average(bars(1.0, 2.0), 3) == []


def test_a_period_below_two_is_not_a_period() -> None:
    assert weighted_average(bars(*rising(5)), 1) == []
    assert weighted_average(bars(*rising(5)), 0) == []
    assert weighted_average(bars(*rising(5)), -3) == []


def test_a_flat_stretch_averages_to_the_close_it_repeats() -> None:
    """Equal closes make the weights cancel, whatever they are — the fixture the relations use."""
    found = weighted_average(bars(50.0, 50.0, 50.0, 50.0, 50.0), 3)
    assert [value for _, value in values(found)] == [50.0, 50.0, 50.0]


def test_the_point_carries_the_bar_it_is_anchored_on() -> None:
    """A Point is its bar plus the value — the inherited OHLCV is the bar's own."""
    found = weighted_average(bars(1.0, 2.0, 3.0), 3)
    assert found[0].time == at(2)
    assert (found[0].open, found[0].high, found[0].low, found[0].close) == (3.0, 4.0, 2.0, 3.0)


# --- the two properties the rolling spelling is for ---------------------------------------------


def test_no_bar_is_averaged_with_a_close_it_could_not_have_seen() -> None:
    """Causality: the value on bar `k` is what a window ending at bar `k` answers.

    The no-look-ahead rule as an equality, over both flavours. It is what makes the right-hand end
    of the line move on every tick rather than being drawn from a close that had not happened, and
    it is the one property the rolling sums could break while still producing a smooth curve.
    """
    history = bars(*rising(3 * PER_HOUR))

    for period, seconds in ((4, None), (3, 3600)):
        whole = weighted_average(history, period, seconds)
        assert whole
        for point in whole:
            # Truncated at the Point's *own* bar, read off the Point rather than counted: a bucketed
            # run does not start at the period-th bar, and assuming it did is how this test lies.
            at_bar = round((point.time - OPEN).total_seconds() // 300)
            truncated = weighted_average(history[: at_bar + 1], period, seconds)
            assert truncated[-1] == point


def test_one_bucket_per_bar_is_what_the_emitting_timeframe_asks_for() -> None:
    """Buckets of 300 seconds over five-minute bars are the bars themselves — the same numbers.

    The equivalence that keeps this one function rather than two: the bucketed spelling has to
    answer the plain one exactly where the two describe the same thing, or the aggregation is a
    second average wearing the same name.
    """
    history = bars(*rising(20))
    assert weighted_average(history, 5, 300) == weighted_average(history, 5)


# --- the buckets --------------------------------------------------------------------------------


def test_a_bucketed_average_starts_at_the_period_th_bucket_and_then_answers_every_bar() -> None:
    """Three hourly buckets of five-minute bars: nothing until the third hour, then every bar.

    The warm-up in its expensive form. Two full hours — twenty-four bars — say nothing, because two
    closed buckets plus the one in progress is what the third hour's first bar is the first to have.
    """
    found = weighted_average(bars(*rising(3 * PER_HOUR)), 3, 3600)
    assert [index for index, _ in values(found)] == list(range(2 * PER_HOUR, 3 * PER_HOUR))


def test_inside_one_bucket_only_the_bucket_in_progress_moves() -> None:
    """Consecutive bars of one hour differ by exactly the newest close's own weight.

    The staircase, stated precisely. What is flat within an hour is the *closed* part of the sum;
    the bar being read enters at weight `period` and is replaced by the next bar of the same hour,
    so two neighbours differ by `period * (close₂ - close₁) / divisor` and by nothing else. A test
    asserting flatness would be asserting something the docstring does not claim.
    """
    period, closes = 3, rising(3 * PER_HOUR)
    found = weighted_average(bars(*closes), period, 3600)
    divisor = period * (period + 1) / 2

    inside = [point for point in found if point.time.minute != 0]
    assert inside
    for point in inside:
        index = round((point.time - OPEN).total_seconds() // 300)
        before = next(other for other in found if other.time == at(index - 1))
        assert point.value - before.value == period * (closes[index] - closes[index - 1]) / divisor


def test_a_bucket_joined_halfway_still_closes_on_its_last_bar() -> None:
    """A window starting mid-hour: the partial bucket contributes the close it had, not a guess.

    The ordinary case rather than an edge one — a loaded window starts wherever the limit put it.
    Only closes are read, so a bucket cut off at its *left* edge is still right: its close is its
    last bar's close. Checked by building the same two closed buckets out of one bar each and
    asserting the two runs agree.
    """
    # 13:20 is the fifth bar of the 13:00 hour. Three bars of it, then a full hour, then one more.
    partial = [closing(10.0, 4), closing(20.0, 5), closing(30.0, 6)]
    second = [closing(40.0, PER_HOUR), closing(50.0, PER_HOUR + 1)]
    third = [closing(60.0, 2 * PER_HOUR)]

    found = weighted_average(partial + second + third, 3, 3600)
    #: The 13:00 bucket closed at 30 and the 14:00 one at 50 — one bar each says the same thing.
    lone = weighted_average([closing(30.0, 6), closing(50.0, PER_HOUR + 1), closing(60.0, 2 * PER_HOUR)], 3, 3600)

    assert [value for _, value in values(found)] == [value for _, value in values(lone)]
    assert values(found) == [(2 * PER_HOUR, (30.0 + 2 * 50.0 + 3 * 60.0) / 6)]


# --- the Pattern --------------------------------------------------------------------------------


def test_the_producer_key_names_the_period_and_the_bucket() -> None:
    """The opposite of `line-relations`' pinned key, and deliberately.

    Two averages in one pipeline are two Series. A key that left the period out would let them
    collide in `ctx`, and the second would silently answer under the first's name.
    """
    plain = WeightedAveragePattern(period=30, reads=("5m",), emits="5m")
    hourly = WeightedAveragePattern(period=30, bucket="1h", reads=("5m",), emits="5m")
    shorter = WeightedAveragePattern(period=9, reads=("5m",), emits="5m")

    assert plain.producer == "weighted-average(period=30,bucket=None,reads=5m,emits=5m)"
    assert hourly.producer == "weighted-average(period=30,bucket=1h,reads=5m,emits=5m)"
    assert len({plain.producer, hourly.producer, shorter.producer}) == 3


def test_the_name_is_the_period_and_the_bucket_when_there_is_one() -> None:
    """What the sidebar shows, and what `average-relations` writes into every `line` field."""
    assert label(30, None) == "wma-30"
    assert label(30, "1h") == "wma-30-1h"
    assert WeightedAveragePattern(period=9, bucket="1h", reads=("5m",), emits="5m").name == "wma-9-1h"


def test_the_pattern_answers_the_function_under_its_own_identity() -> None:
    pattern = WeightedAveragePattern(period=3, reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*rising(6))}, (pattern,))
    found: BaseSeries[WeightedAverage] = engine.run()[pattern.producer]

    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert list(found.points) == weighted_average(bars(*rising(6)), 3)


def test_the_bucket_reaches_the_arithmetic_as_seconds() -> None:
    """`bucket="1h"` and `seconds=3600` are one setting said two ways."""
    pattern = WeightedAveragePattern(period=3, bucket="1h", reads=("5m",), emits="5m")
    closes = rising(3 * PER_HOUR)
    engine = PatternEngine({"5m": series(*closes)}, (pattern,))

    assert list(engine.run()[pattern.producer].points) == weighted_average(bars(*closes), 3, 3600)


def test_a_window_too_short_is_an_empty_series_and_not_a_missing_key() -> None:
    """The distinction ADR-0004 turns on: "found nothing" must not read as "did not run"."""
    pattern = WeightedAveragePattern(period=30, reads=("5m",), emits="5m")
    ctx = PatternEngine({"5m": series(*rising(4))}, (pattern,)).run()

    assert pattern.producer in ctx
    assert not ctx[pattern.producer]
