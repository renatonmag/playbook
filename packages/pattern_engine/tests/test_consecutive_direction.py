"""Tests for the three-consecutive-bars direction, and the Pattern that reports it.

Two layers, tested apart, the same way `test_bar_gap.py` does it: `consecutive_direction` is
handed Candles built by hand, and the Pattern is driven through a real `PatternEngine` run.

Every bull fixture is mirrored by `flipped` rather than typed a second time — the rule is
symmetric by construction, and a bear fixture written out separately is a place for the two sides
to drift apart in silence.

The fixtures carry **wide, overlapping ranges on purpose**. Nothing in this rule reads `high` or
`low`, and ranges that never separate are what keeps a reader from suspecting they do. The one
exception is `DOJI_OFF_MIDPOINT`, whose whole job is to be a bar that `leans` would call bullish
and this rule calls nothing at all.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.consecutive_direction import (
    ConsecutiveDirection,
    ConsecutiveDirectionPattern,
    consecutive_direction,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

Spec = tuple[float, float, float, float]


def bull(at: float) -> Spec:
    """`(open, high, low, close)` for a bar closing a point above where it opened."""
    return (at, at + 2.0, at - 2.0, at + 1.0)


def bear(at: float) -> Spec:
    """The mirror: a bar closing a point below where it opened."""
    return (at, at + 2.0, at - 2.0, at - 1.0)


def doji(at: float) -> Spec:
    """A bar closing exactly where it opened, centred in its own range — no lean by any reading."""
    return (at, at + 2.0, at - 2.0, at)


#: Exactly `SPAN` bull bars and nothing else. The clean case: one mark, on the last of them.
TRIPLE = (bull(100.0), bull(101.0), bull(102.0))

#: Five bull bars. The once-per-run rule: the fourth and fifth are the same run still standing.
LONG_RUN = (bull(100.0), bull(101.0), bull(102.0), bull(103.0), bull(104.0))

#: Two bull bars with nowhere to go. Under `SPAN` is not a run, however clean the two bars are.
PAIR = (bull(100.0), bull(101.0))

#: Three bull, one bear, three bull. Two separate runs, and the bear bar belongs to neither.
BROKEN = (
    bull(100.0),
    bull(101.0),
    bull(102.0),
    bear(103.0),
    bull(102.0),
    bull(103.0),
    bull(104.0),
)

#: Two bull then three bear. The bar that broke the bull run is the *first* of the bear run, so
#: the run completes on the last bar rather than one bar later.
TURNED = (bull(100.0), bull(101.0), bear(102.0), bear(101.0), bear(100.0))

#: Two bull bars and a doji where the third would have been. The run dies on the flat bar.
DOJI_THIRD = (bull(100.0), bull(101.0), doji(102.0))

#: Two bull, a doji, then three bull. The doji resets to zero rather than being skipped over: if
#: it were merely ignored, the first bar after it would be the run's third and would mark.
DOJI_MID = (
    bull(100.0),
    bull(101.0),
    doji(102.0),
    bull(102.0),
    bull(103.0),
    bull(104.0),
)

#: Two bull bars, then a flat body closing in the *top* of its own range. `leans` calls that
#: bullish and would complete the run here; this rule reads the body alone and calls it nothing.
DOJI_OFF_MIDPOINT = (bull(100.0), bull(101.0), (102.0, 103.0, 98.0, 102.0))


def flipped(specs: tuple[Spec, ...]) -> tuple[Spec, ...]:
    """`specs` mirrored about zero — `high` and `low` swap, and every price negates."""
    return tuple((-o, -low, -high, -c) for o, high, low, c in specs)


def series(*specs: Spec) -> BaseSeries[Candle]:
    """Candles at five-minute spacing from `OPEN`, one per `(open, high, low, close)`."""
    bars = [
        Candle(
            time=OPEN + timedelta(minutes=5 * i),
            open=spec[0],
            high=spec[1],
            low=spec[2],
            close=spec[3],
            volume=100.0,
        )
        for i, spec in enumerate(specs)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


def marks(specs: tuple[Spec, ...]) -> list[tuple[int, str]]:
    """The findings as `(bar index, direction)`, which is the whole of what this rule says."""
    found = consecutive_direction(series(*specs).points)
    return [
        (round((point.time - OPEN).total_seconds() / 300), point.direction) for point in found
    ]


def test_three_bull_bars_mark_the_third() -> None:
    assert marks(TRIPLE) == [(2, "bullish")]


def test_three_bear_bars_mark_the_third() -> None:
    """The mirror, written out rather than parametrised: it is the other half of the rule."""
    assert marks(flipped(TRIPLE)) == [(2, "bearish")]


@pytest.mark.parametrize("specs", [LONG_RUN, flipped(LONG_RUN)])
def test_a_long_run_marks_once(specs: tuple[Spec, ...]) -> None:
    """Five same-side bars are one event, on the third. The fourth and fifth are not a stutter."""
    assert len(marks(specs)) == 1
    assert marks(specs)[0][0] == 2


@pytest.mark.parametrize("specs", [PAIR, flipped(PAIR)])
def test_two_bars_are_not_a_run(specs: tuple[Spec, ...]) -> None:
    assert marks(specs) == []


@pytest.mark.parametrize("specs", [BROKEN, flipped(BROKEN)])
def test_a_broken_run_starts_over(specs: tuple[Spec, ...]) -> None:
    """The bar that broke it is not counted toward what follows unless it shares that side."""
    assert [at for at, _ in marks(specs)] == [2, 6]


@pytest.mark.parametrize("specs", [TURNED, flipped(TURNED)])
def test_the_bar_that_broke_a_run_opens_the_next(specs: tuple[Spec, ...]) -> None:
    """A colour change restarts the count at one, not zero — so this marks bar 4, not bar 5."""
    assert [at for at, _ in marks(specs)] == [4]


@pytest.mark.parametrize("specs", [DOJI_THIRD, flipped(DOJI_THIRD)])
def test_a_doji_does_not_complete_a_run(specs: tuple[Spec, ...]) -> None:
    """`close == open` is neither side, so the run dies one bar short."""
    assert marks(specs) == []


@pytest.mark.parametrize("specs", [DOJI_MID, flipped(DOJI_MID)])
def test_a_doji_resets_rather_than_being_skipped(specs: tuple[Spec, ...]) -> None:
    """The three bars after it are a fresh run: the mark lands on bar 5, not bar 3."""
    assert [at for at, _ in marks(specs)] == [5]


@pytest.mark.parametrize("specs", [DOJI_OFF_MIDPOINT, flipped(DOJI_OFF_MIDPOINT)])
def test_where_a_flat_bar_closed_in_its_range_is_not_read(specs: tuple[Spec, ...]) -> None:
    """The one place this rule and `leans` part company. The body alone decides here."""
    assert marks(specs) == []


def test_an_empty_window_finds_nothing() -> None:
    """Distinct from a window that held bars and none of them ran three, though both are empty."""
    assert consecutive_direction([]) == []


def test_the_point_carries_the_completing_bars_ohlcv() -> None:
    """Anchored on the third bar, so the OHLCV is that bar's and not the run's."""
    found = consecutive_direction(series(*TRIPLE).points)

    assert isinstance(found[0], ConsecutiveDirection)
    assert (found[0].open, found[0].close) == (102.0, 103.0)


def test_pattern_runs_over_the_engine_bars() -> None:
    """End to end: no sources, so the Candles the engine was handed are the whole input."""
    pattern = ConsecutiveDirectionPattern(reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*BROKEN)}, (pattern,))

    ctx = engine.run()

    assert pattern.producer == "consecutive-direction(reads=5m,emits=5m)"
    found: BaseSeries[ConsecutiveDirection] = ctx[pattern.producer]
    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert [point.direction for point in found.points] == ["bullish", "bullish"]
