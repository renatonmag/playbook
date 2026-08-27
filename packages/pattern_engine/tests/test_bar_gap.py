"""Tests for the three-bar gap, and the Pattern that reports it.

Two layers, tested apart, the same way `test_leg_extremes.py` does it: `bar_gaps` is handed
Candles built by hand, and the Pattern is driven through a real `PatternEngine` run.

Every bull fixture is mirrored by `flipped` rather than typed a second time. A gap down is the
vertical mirror of a gap up, which is the claim the direction rule makes, and a mirrored fixture
is how it gets made honestly.

The `closed_by` fixtures each hold **exactly one** gap. Bars appended after a triple make new
triples of their own, and every one of them was checked not to gap — otherwise a test asserting
about "the gap" would be asserting about whichever one happened to come first.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, PatternEngine, SeriesIdentity
from pattern_engine.patterns.bar_gap import BarGap, BarGapPattern, bar_gaps
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: `(open, high, low, close)` per bar. Bar 0 tops out at 110 and bar 2 bottoms at 120, so the
#: band `(110, 120)` is untraded by either — a clean gap up over a single impulse bar.
GAPPED = (
    (100.0, 110.0, 98.0, 108.0),
    (109.0, 125.0, 108.0, 124.0),
    (124.0, 132.0, 120.0, 130.0),
)

#: The same three bars with bar 2 pulled down so its low sits *on* bar 0's high. The ranges touch
#: and nothing lies between them.
TOUCHING = (
    (100.0, 110.0, 98.0, 108.0),
    (109.0, 125.0, 108.0, 124.0),
    (124.0, 132.0, 110.0, 130.0),
)

#: A middle bar with an enormous range and neighbours that overlap. The rule never reads bar 2, so
#: this is not a gap however violent the bar between is.
OVERLAPPING = (
    (100.0, 110.0, 98.0, 108.0),
    (109.0, 200.0, 50.0, 124.0),
    (124.0, 132.0, 105.0, 130.0),
)

#: `GAPPED` plus three bars that take price back down through the band.
#:
#: Bar 3 dips *into* it — a low of 115, inside `(110, 120)` — and does not reach the far edge, so
#: it must not count. Bar 4 puts its low exactly on `110`, which is the `<=` case: an arrival at
#: the far edge has crossed the band. Bar 5 goes further still and is there to be *not* chosen.
FILLED = (
    *GAPPED,
    (130.0, 134.0, 115.0, 118.0),  # into the band, not through it
    (118.0, 120.0, 110.0, 112.0),  # closes it, exactly on the edge
    (112.0, 118.0, 100.0, 105.0),  # also qualifies, and is too late
)

#: `GAPPED` plus two bars that stay clear of the band, so the gap is still open at the last bar.
CLEAR = (
    *GAPPED,
    (130.0, 134.0, 125.0, 128.0),
    (128.0, 132.0, 121.0, 130.0),
)

#: Four bars in a run where *both* triples gap: 0-2 leaves `(110, 120)` and 1-3 leaves
#: `(125, 140)`. Two facts, one bar apart.
RUNNING = (
    (100.0, 110.0, 98.0, 108.0),
    (109.0, 125.0, 108.0, 124.0),
    (124.0, 132.0, 120.0, 130.0),
    (140.0, 150.0, 140.0, 148.0),
)


def flipped(
    specs: tuple[tuple[float, float, float, float], ...],
) -> tuple[tuple[float, float, float, float], ...]:
    """`specs` mirrored about zero — `high` and `low` swap, and every price negates."""
    return tuple((-o, -low, -high, -c) for o, high, low, c in specs)


def series(*specs: tuple[float, float, float, float]) -> BaseSeries[Candle]:
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


def test_reports_a_gap_up() -> None:
    found = bar_gaps(series(*GAPPED).points)

    assert len(found) == 1
    assert found[0].direction == "bullish"
    # The first bar's high and the third bar's low, in that order as `bottom`/`top`.
    assert (found[0].bottom, found[0].top) == (110.0, 120.0)


def test_reports_a_gap_down() -> None:
    """The mirror of `test_reports_a_gap_up`, and the only place direction is read from prices."""
    found = bar_gaps(series(*flipped(GAPPED)).points)

    assert len(found) == 1
    assert found[0].direction == "bearish"
    # Mirrored: the third bar's high is now the floor and the first bar's low the ceiling.
    assert (found[0].bottom, found[0].top) == (-120.0, -110.0)


@pytest.mark.parametrize("specs", [TOUCHING, flipped(TOUCHING)])
def test_a_touch_is_not_a_gap(specs: tuple[tuple[float, float, float, float], ...]) -> None:
    """`bar_1.high == bar_3.low` leaves no band. The comparison is strict on both sides."""
    assert bar_gaps(series(*specs).points) == []


@pytest.mark.parametrize("specs", [OVERLAPPING, flipped(OVERLAPPING)])
def test_the_middle_bar_is_not_read(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """A huge bar 2 between two overlapping neighbours is still no gap."""
    assert bar_gaps(series(*specs).points) == []


def test_overlapping_triples_are_both_reported() -> None:
    found = bar_gaps(series(*RUNNING).points)

    assert [(gap.bottom, gap.top) for gap in found] == [(110.0, 120.0), (125.0, 140.0)]
    # Anchored on each triple's *first* bar, so the two anchors are one bar apart and strictly
    # increasing — what `BaseSeries` requires of any Series built from these.
    assert [gap.time for gap in found] == [OPEN, OPEN + timedelta(minutes=5)]


def test_anchors_on_the_first_bar_of_the_triple() -> None:
    """The inherited OHLCV is bar 1's, and says nothing about the gap."""
    bars = series(*GAPPED)
    gap = bar_gaps(bars.points)[0]

    assert gap.time == bars[0].time
    assert (gap.open, gap.high, gap.low, gap.close) == (100.0, 110.0, 98.0, 108.0)


@pytest.mark.parametrize("specs", [GAPPED, flipped(GAPPED), RUNNING, flipped(RUNNING)])
def test_bottom_is_always_below_top(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """The whole point of naming the edges rather than the bars: no caller branches on direction."""
    for gap in bar_gaps(series(*specs).points):
        assert gap.bottom < gap.top


@pytest.mark.parametrize("count", [0, 1, 2])
def test_too_few_bars_for_a_triple(count: int) -> None:
    assert bar_gaps(series(*GAPPED[:count]).points) == []


def test_pattern_runs_over_the_engine_bars() -> None:
    """End to end: no sources, so the Candles the engine was handed are the whole input."""
    pattern = BarGapPattern(reads=("5m",), emits="5m")
    engine = PatternEngine({"5m": series(*RUNNING)}, (pattern,))

    ctx = engine.run()

    assert pattern.producer == "bar-gap(reads=5m,emits=5m)"
    found: BaseSeries[BarGap] = ctx[pattern.producer]
    assert found.identity == SeriesIdentity(pattern.producer, "WIN@N", "5m")
    assert [(gap.bottom, gap.top, gap.direction) for gap in found.points] == [
        (110.0, 120.0, "bullish"),
        (125.0, 140.0, "bullish"),
    ]


def test_a_bar_reaching_the_far_edge_closes_the_gap() -> None:
    """The `<=` case: bar 4's low is exactly `bottom`, and arriving at the edge has crossed it."""
    bars = series(*FILLED)
    found = bar_gaps(bars.points)

    assert len(found) == 1
    assert found[0].closed_by == bars[4]


def test_a_bar_reaching_the_far_edge_closes_a_bear_gap() -> None:
    """The mirror, where the far edge is `top` and the reading is `high >= top`."""
    bars = series(*flipped(FILLED))
    found = bar_gaps(bars.points)

    assert len(found) == 1
    assert found[0].closed_by == bars[4]


@pytest.mark.parametrize("specs", [FILLED, flipped(FILLED)])
def test_the_first_qualifying_bar_closes_it(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """Bar 5 goes further than bar 4 and arrives later, so it is not the answer.

    `closed_by` is when the gap died, not the last time price came back to it.
    """
    bars = series(*specs)

    assert bar_gaps(bars.points)[0].closed_by != bars[5]


@pytest.mark.parametrize("specs", [FILLED, flipped(FILLED)])
def test_a_bar_inside_the_band_does_not_close_it(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """Bar 3 trades into the gap and stops short of the far edge. A partial fill is not a close."""
    bars = series(*specs)

    assert bar_gaps(bars.points)[0].closed_by != bars[3]


@pytest.mark.parametrize("specs", [CLEAR, flipped(CLEAR)])
def test_a_gap_nothing_traded_back_into_stays_open(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    assert bar_gaps(series(*specs).points)[0].closed_by is None


@pytest.mark.parametrize("specs", [GAPPED, flipped(GAPPED)])
def test_the_third_bar_does_not_close_its_own_gap(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """The extreme bar 3 is read for *is* the near edge, and the scan starts past it anyway.

    With no bars after the triple there is nothing else that could close it, so an `open` here is
    the whole claim: the gap's own third bar was not mistaken for the bar that filled it.
    """
    assert bar_gaps(series(*specs).points)[0].closed_by is None


def test_closed_by_carries_the_whole_bar() -> None:
    """A Candle, not a timestamp — the extreme that made the claim true travels with it."""
    bars = series(*FILLED)
    gap = bar_gaps(bars.points)[0]

    assert gap.closed_by is not None
    assert gap.closed_by.time == bars[4].time
    assert (
        gap.closed_by.open,
        gap.closed_by.high,
        gap.closed_by.low,
        gap.closed_by.close,
    ) == (118.0, 120.0, 110.0, 112.0)
    # And it makes the rule check out against the band it closed, which is the point of carrying it.
    assert gap.closed_by.low <= gap.bottom


@pytest.mark.parametrize("specs", [FILLED, CLEAR, flipped(FILLED), flipped(CLEAR)])
def test_the_closing_scan_finds_exactly_one_gap(
    specs: tuple[tuple[float, float, float, float], ...],
) -> None:
    """Guards the fixtures themselves: the appended bars must not form a second gap.

    Without this the tests above would silently start asserting about a different gap the day a
    fixture is edited.
    """
    assert len(bar_gaps(series(*specs).points)) == 1
