"""Tests for the reversal filters and the Pattern that runs them over each leg.

Two layers, tested apart, the same way `test_leg_window.py` does it. The filters are handed
Candles built by hand — each one a named constant with its proportions worked out in the comment,
because every assertion below is really about those proportions and reading them off an OHLC tuple
in the middle of a test is how a fixture ends up meaning something other than what it says.

The Pattern is then driven with pivots placed by hand rather than by a detector, which is what
lets a leg be made to close on a low or on a high over the *same* bars — the one thing the
direction rule has to be tested against.
"""

from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, FormaRule, SeriesIdentity, shape_of
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.leg_reversals import (
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
    LegReversals,
    LegReversalsPattern,
    adjacent,
    alike,
    average_amplitude,
    dominates,
    nests,
)
from pattern_engine.patterns.leg_window import LegWindowPattern, split_leg_windows
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES
from pattern_engine.shape import marks

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The rule of `docs/forma/rules.json`, minus the `direction` the Pattern refuses to read.
RULE_K = FormaRule(
    name="K",
    require_wf_over_wc=True,
    wf_min=0.49,
    wc_max=1.0,
    wc_max_ratio=None,
    body_min=0.0,
    body_max=0.35,
    colour="nunca",
    colour_body_min=1.0,
)

# `(open, high, low, close)`, all with amplitude 10 unless said otherwise, so the expansion test
# has a flat baseline to compare against and never rejects a pair for a reason a test did not mean.

#: upper 0.4, lower 0.4, body 0.2. Marks nothing on *either* side, which is what a filler has
#: to be: the body is too small to dominate, and both shadows fall short of K's 0.49 — so the
#: bar is neutral whichever way a leg is read. Symmetric on purpose; a filler that marked on
#: one side would make every direction test pass for the wrong reason.
FILLER = (100.0, 106.0, 96.0, 102.0)
#: body 1.0, bearish. Half of a pair.
BEAR = (110.0, 110.0, 100.0, 100.0)
#: body 1.0, bullish. The other half — and the one that decides a pair's direction.
BULL = (100.0, 110.0, 100.0, 110.0)
#: upper 0.2, lower 0.6, body 0.2, bullish. A hammer: rule K on the *bullish* side only.
HAMMER = (106.0, 110.0, 100.0, 108.0)
#: The vertical mirror — upper 0.6, lower 0.2, body 0.2. Rule K on the bearish side only.
SHOOTER = (104.0, 110.0, 100.0, 102.0)
#: One price, all day. `shape_of` returns None for it, so no filter can read it.
FLAT = (100.0, 100.0, 100.0, 100.0)
#: Amplitude 100 and marks nothing — ten times the others, to move an average visibly.
BIG = (1000.0, 1100.0, 1000.0, 1010.0)
#: Contained in `FILLER` on both sides — 104 under its 106, 98 over its 96. Deliberately invisible
#: to the other two filters: body 0.5 dominates nothing a neutral neighbour can pair with, and
#: both shadows fall short of K's 0.49, so anything this bar is listed for is containment.
INSIDE = (99.0, 104.0, 98.0, 102.0)
#: `FILLER`'s exact extremes, reached from the other side — the boundary case for `>=` and `<=`.
#: A high that was equalled is a high that was not exceeded, so this still nests.
EDGE = (102.0, 106.0, 96.0, 100.0)
#: Wider than `FILLER` on both sides, so it nests in nothing. Marks nothing else either.
OUTSIDE = (100.0, 108.0, 94.0, 102.0)
#: Covers `HAMMER`'s extremes exactly, which is how one bar is made to carry two findings.
MOTHER = (101.0, 110.0, 100.0, 109.0)


def series(*specs: tuple[float, float, float, float], start: datetime = OPEN) -> BaseSeries[Candle]:
    """Candles at five-minute spacing from `start`, one per `(open, high, low, close)`."""
    bars = [
        Candle(
            time=start + timedelta(minutes=5 * i),
            open=spec[0],
            high=spec[1],
            low=spec[2],
            close=spec[3],
            volume=100.0,
        )
        for i, spec in enumerate(specs)
    ]
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


def vertices(
    bars: BaseSeries[Candle], *placed: tuple[int, int | None, str]
) -> list[ZigZagPivot]:
    """Vertices placed by hand as `(vertex index, turn index, which extreme)`.

    `direction` is written out rather than alternated, because it is the input the Pattern reads
    to decide which reversal a leg is looking for — the one thing these tests exist to vary.
    """
    return [
        ZigZagPivot.anchored(
            bars[at],
            price=bars[at].close,
            direction=direction,
            since=bars[turn] if turn is not None else None,
        )
        for at, turn, direction in placed
    ]


def run(
    bars: BaseSeries[Candle],
    *placed: tuple[int, int | None, str],
    rule: FormaRule = RULE_K,
    k: float = DEFAULT_K,
    similarity: float = DEFAULT_SIMILARITY,
    expansion: float = DEFAULT_EXPANSION,
    ahead: int = 5,
    pivots_shown: int | None = None,
) -> BaseSeries[LegReversals]:
    """Build the two source Series by hand and run the Pattern over them, as a pipeline would.

    The legs are cut from *all* the vertices; `pivots_shown` truncates only the Series the Pattern
    reads for directions, which is how a mismatched pipeline is simulated without building one.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    windows = LegWindowPattern(source=zigzag, ahead=ahead, reads=("5m",), emits="5m")
    placed_pivots = vertices(bars, *placed)

    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    ctx[zigzag.producer] = BaseSeries(
        SeriesIdentity(zigzag.producer, "WIN@N", "5m"), placed_pivots[:pivots_shown]
    )
    ctx[windows.producer] = BaseSeries(
        SeriesIdentity(windows.producer, "WIN@N", "5m"),
        split_leg_windows(bars.points, placed_pivots, ahead),
    )

    return LegReversalsPattern(
        source=windows,
        pivots=zigzag,
        rule=rule,
        k=k,
        similarity=similarity,
        expansion=expansion,
        reads=("5m",),
        emits="5m",
    ).run(ctx)


def listed(point: LegReversals, type: str | None = None) -> list[tuple[int, str]]:
    """A leg's findings as `(at, type)`, which is what every assertion here is really about.

    `type` narrows to one filter. Most tests below want that, because the filters are a union over
    the same bars and each test is about one of them — `inside-bar` in particular fires on any
    repeated fixture bar, since a bar with the same extremes as the one before it *is* inside it,
    and padding a fixture with twelve copies of `FILLER` would otherwise make every test an
    inside-bar test. The unfiltered call is kept for the tests that are about the union itself.
    """
    return [
        (bar.at, bar.type) for bar in point.found if type is None or bar.type == type
    ]


def drifting(n: int) -> list[tuple[float, float, float, float]]:
    """`n` bars with `FILLER`'s proportions, each stepped up so none sits inside the one before.

    The only padding that marks *nothing at all*. Repeating one constant cannot do it: identical
    extremes satisfy containment, so a run of one bar is a run of inside bars.
    """
    return [(100.0 + 2 * i, 106.0 + 2 * i, 96.0 + 2 * i, 102.0 + 2 * i) for i in range(n)]


def nesting(n: int, at: int) -> list[tuple[float, float, float, float]]:
    """`drifting(n)`, with the bar at `at` replaced by one its predecessor contains.

    Built from that predecessor rather than written out, because `drifting` walks the price up and
    a fixed constant would sit below the run instead of inside it. `INSIDE`'s proportions, shifted
    — so the replacement is invisible to the other two filters wherever it lands.
    """
    bars = drifting(n)
    _, high, low, _ = bars[at - 1]
    bars[at] = (low + 3.0, high - 2.0, low + 2.0, high - 4.0)
    return bars


# --- the Forma rule ---------------------------------------------------------------------


def test_rule_k_marks_the_hammer_on_the_bullish_side_and_nothing_on_the_bearish_one():
    shape = shape_of(series(HAMMER)[0])
    assert shape is not None

    # wf is the lower shadow for a bullish reversal: 0.6, clear of K's 0.49, with a body of 0.2
    # under its ceiling of 0.35.
    assert marks(RULE_K, shape, "bullish")
    # The same bar read for a bearish reversal has wf 0.2, and K wants at least 0.49.
    assert not marks(RULE_K, shape, "bearish")


def test_the_mirror_bar_marks_on_the_mirror_side():
    shape = shape_of(series(SHOOTER)[0])
    assert shape is not None

    assert marks(RULE_K, shape, "bearish")
    assert not marks(RULE_K, shape, "bullish")


def test_rule_k_and_the_pair_filter_never_agree_at_the_default_k():
    # Not a coincidence to be tested away: `dominates` needs `body >= k * wf` and K needs
    # `wf >= 0.49` with `body <= 0.35`, which together require `k <= 0.714`.
    for spec in (BEAR, BULL):
        shape = shape_of(series(spec)[0])
        assert shape is not None
        assert dominates(shape, DEFAULT_K)
        assert not marks(RULE_K, shape, "bullish")
        assert not marks(RULE_K, shape, "bearish")


# --- the pair filter's parts ------------------------------------------------------------


def test_dominates_is_inclusive_on_the_boundary():
    # Thirds: body exactly equal to the larger shadow. About 2% of the real `5m` history sits
    # here, and each pair reads two bars, so `>=` against `>` is not a rounding detail.
    shape = shape_of(series((1.0, 3.0, 0.0, 2.0))[0])
    assert shape is not None
    assert shape.body == max(shape.upper, shape.lower)
    assert dominates(shape, 1.0)


def test_alike_compares_bodies_in_points_not_in_fractions():
    bars = series(
        (100.0, 110.0, 100.0, 110.0),  # body of 10 points
        (100.0, 106.0, 100.0, 106.0),  # body of 6 points, and the same fraction — 1.0
    )
    # Both bodies fill their bar completely, so as fractions they are identical. What the dial
    # asks is whether the two pushes are comparable in the instrument's own points: 0.6.
    assert alike(bars[0], bars[1], 0.5)
    assert not alike(bars[0], bars[1], 0.7)


def test_adjacent_refuses_a_gap_and_a_day_boundary():
    contiguous = series(FILLER, FILLER)
    assert adjacent(contiguous[0], contiguous[1], "5m")

    gapped = series(FILLER, FILLER, FILLER)
    assert not adjacent(gapped[0], gapped[2], "5m"), "ten minutes is not one 5m bar"

    # One bar apart to the second, and still not adjacent: the session ended in between.
    across = series(FILLER, start=datetime(2026, 8, 12, 23, 55, tzinfo=UTC))
    after = series(FILLER, start=datetime(2026, 8, 13, 0, 0, tzinfo=UTC))
    assert not adjacent(across[0], after[0], "5m")


def test_the_average_stops_at_a_session_boundary():
    bars = series(BIG, BIG, start=datetime(2026, 8, 12, 23, 50, tzinfo=UTC))
    later = series(FILLER, FILLER, start=datetime(2026, 8, 13, 9, 0, tzinfo=UTC))
    whole = BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"), [*bars.points, *later.points]
    )

    # Bar 3 has one adjacent predecessor and then a gap; yesterday's two big bars are not in it.
    assert average_amplitude(whole.points, 3, "5m") == 10.0
    # Bar 2 opens the session, so there is nothing to average and the criterion cannot reject.
    assert average_amplitude(whole.points, 2, "5m") is None


# --- the inside bar ---------------------------------------------------------------------


def test_a_bar_contained_by_the_one_before_it_nests():
    bars = series(FILLER, INSIDE)
    assert nests(bars.points, 1, "5m")


def test_containment_is_inclusive_on_both_extremes():
    # The whole difference between this and `_engulfs` in `simple_leg.py`, which demands a strict
    # break of both. An equal high is a high that was not exceeded — that is containment.
    bars = series(FILLER, EDGE)
    assert nests(bars.points, 1, "5m")

    # And the degenerate case the fixtures keep running into: a bar identical to its predecessor
    # is inside it, which is why padding cannot be one constant repeated.
    same = series(FILLER, FILLER)
    assert nests(same.points, 1, "5m")


def test_a_bar_wider_on_either_side_does_not_nest():
    wider = series(FILLER, OUTSIDE)
    assert not nests(wider.points, 1, "5m")

    # One side is enough to disqualify it: the high is under `FILLER`'s, the low is under it too.
    below = series(FILLER, (100.0, 104.0, 90.0, 102.0))
    assert not nests(below.points, 1, "5m")


def test_the_mother_bar_is_not_the_one_that_nests():
    # Containment is asymmetric and read backwards: `INSIDE` sits in `FILLER`, never the reverse.
    bars = series(INSIDE, FILLER)
    assert not nests(bars.points, 1, "5m")


def test_the_first_bar_of_the_history_nests_in_nothing():
    bars = series(FILLER, INSIDE)
    assert not nests(bars.points, 0, "5m")


def test_containment_does_not_reach_across_a_session_boundary():
    # One bar apart to the second, and still not a pair: yesterday's last bar is not "the bar
    # before" this one in any sense that makes containment mean something.
    across = series(FILLER, start=datetime(2026, 8, 12, 23, 55, tzinfo=UTC))
    after = series(INSIDE, start=datetime(2026, 8, 13, 0, 0, tzinfo=UTC))
    whole = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), [*across.points, *after.points])

    assert not nests(whole.points, 1, "5m")


def test_a_leg_lists_its_inside_bars_and_not_their_mothers():
    bars = series(*nesting(18, 12))
    points = run(bars, (0, None, "high"), (17, 12, "low"))

    # `drifting` nests nowhere, so bar 12 is the only inside bar in the leg — and bar 11, which
    # contains it, is not listed.
    assert listed(points[0], "inside-bar") == [(12, "inside-bar")]


def test_the_inside_filter_ignores_the_direction_of_the_leg():
    bars = series(*nesting(20, 12))

    # The same bars, read as a leg that fell and as a leg that rose. Unlike the other two filters,
    # this one reads no body, so it has nothing to say about which way the leg was going.
    closing_low = run(bars, (0, None, "high"), (19, 12, "low"))
    closing_high = run(bars, (0, None, "low"), (19, 12, "high"))

    assert listed(closing_low[0], "inside-bar") == [(12, "inside-bar")]
    assert listed(closing_high[0], "inside-bar") == [(12, "inside-bar")]


def test_the_first_bar_of_a_leg_is_measured_against_the_bar_before_the_leg():
    # The leg opens at bar 10, and its first bar nests in bar 9 — outside the leg entirely. Same
    # global measurement the pair filter gets, for the same reason: the slice decides what is
    # listed, never what is true.
    bars = series(*nesting(20, 10))
    points = run(bars, (10, None, "high"), (19, 11, "low"))

    assert listed(points[0], "inside-bar") == [(0, "inside-bar")]


def test_one_bar_can_carry_an_inside_mark_and_a_shape_mark_at_once():
    bars = series(*drifting(12), MOTHER, HAMMER, *drifting(4))
    points = run(bars, (0, None, "high"), (17, 12, "low"))

    # `MOTHER` covers `HAMMER`'s extremes exactly, and the leg closes on a low, so rule K reads
    # the hammer too. Two filters, two findings, one bar — the mutual exclusion that holds between
    # the pair filter and rule K says nothing about containment, and this is where `found` stops
    # being keyable on `at` alone.
    assert listed(points[0]) == [(13, "inside-bar"), (13, "reversal-bar")]


# --- what a leg lists -------------------------------------------------------------------


def test_a_pair_lists_both_of_its_bars_once_each():
    bars = series(*([FILLER] * 12), BEAR, BULL, *([FILLER] * 4))
    # The leg closes on a low, so it is looking for a bullish turn — and the pair closes bullish.
    points = run(bars, (0, None, "high"), (17, 12, "low"))

    assert len(points) == 1
    assert listed(points[0], "two-bar") == [(12, "two-bar"), (13, "two-bar")]


def test_a_chained_run_lists_every_bar_once_and_in_order():
    bars = series(*([FILLER] * 12), BEAR, BULL, BEAR, BULL, *([FILLER] * 4))
    points = run(bars, (0, None, "high"), (19, 12, "low"))

    # Four bars, four entries, contiguous `at` — the run read as bars rather than as pairs. The
    # middle link (13, 14) closes bearish and is dropped by the direction filter, which is also
    # what makes a duplicate unreachable: a bar can only close one matching pair, because closing
    # the next one would need it to hold both colours at once.
    assert listed(points[0], "two-bar") == [
        (12, "two-bar"),
        (13, "two-bar"),
        (14, "two-bar"),
        (15, "two-bar"),
    ]


def test_a_bar_with_no_amplitude_is_read_only_by_the_inside_filter():
    bars = series(*([FILLER] * 12), FLAT, HAMMER, *([FILLER] * 4))
    points = run(bars, (0, None, "high"), (17, 12, "low"))

    # The flat bar has no proportions for the two shape filters to read, and is skipped by them
    # rather than guessed at. Its neighbour is still measured normally.
    assert listed(points[0], "two-bar") == []
    assert listed(points[0], "reversal-bar") == [(13, "reversal-bar")]

    # Containment needs no proportions, though: a bar that traded at one price sits inside
    # whatever preceded it. Listing it is the honest answer, not an escaped edge case.
    assert (12, "inside-bar") in listed(points[0], "inside-bar")


def test_the_direction_comes_from_the_leg_not_from_the_rule():
    bars = series(*([FILLER] * 12), HAMMER, FILLER, SHOOTER, *([FILLER] * 5))

    closing_low = run(bars, (0, None, "high"), (19, 12, "low"))
    closing_high = run(bars, (0, None, "low"), (19, 12, "high"))

    # One rule, one set of numbers, both sides — the same bars read against the leg they sit in.
    assert listed(closing_low[0], "reversal-bar") == [(12, "reversal-bar")]
    assert listed(closing_high[0], "reversal-bar") == [(14, "reversal-bar")]


def test_the_point_reports_the_leg_s_own_move_not_the_turn_it_hunts():
    bars = series(*([FILLER] * 12), HAMMER, FILLER, SHOOTER, *([FILLER] * 5))

    rising = run(bars, (0, None, "low"), (19, 12, "high"))
    falling = run(bars, (0, None, "high"), (19, 12, "low"))

    assert rising[0].direction == "bullish", "closed on a high, so the leg rose"
    assert falling[0].direction == "bearish", "closed on a low, so the leg fell"

    # And the marks inside each are the *opposite* side's, which is the whole reason the two
    # values are kept apart: the rising leg is hunting the bearish bar that ends it.
    assert listed(rising[0], "reversal-bar") == [(14, "reversal-bar")], "the shooter"
    assert listed(falling[0], "reversal-bar") == [(12, "reversal-bar")], "the hammer"


def test_a_leg_that_marks_nothing_still_emits_a_point():
    # `drifting`, not a repeated `FILLER`: a bar with the same extremes as the one before it is
    # an inside bar, so repeated padding cannot produce an empty `found`.
    bars = series(*drifting(20))
    points = run(bars, (0, None, "high"), (19, 12, "low"))

    assert len(points) == 1
    assert points[0].found == ()
    assert points[0].time == bars[0].time, "anchored on the leg's opening vertex"


def test_the_expansion_average_reaches_back_past_the_start_of_the_leg():
    # The leg opens at bar 10, and the pair sits at 11 and 12 — right at its start, where a slice
    # of the leg alone would have almost nothing to average and the criterion could not reject.
    quiet = series(*([FILLER] * 11), BEAR, BULL, *([FILLER] * 7))
    loud = series(*([BIG] * 11), BEAR, BULL, *([FILLER] * 7))

    assert listed(run(quiet, (10, None, "high"), (19, 11, "low"))[0], "two-bar") == [
        (1, "two-bar"),
        (2, "two-bar"),
    ]
    # The same pair, in the same place in its leg, rejected — because the ten bars *before the
    # leg began* were ten times its size. Nothing inside the slice could have said so.
    assert listed(run(loud, (10, None, "high"), (19, 11, "low"))[0], "two-bar") == []


def test_a_leg_closing_where_the_pivots_have_no_vertex_raises():
    bars = series(*([FILLER] * 20))

    # The legs are cut at two vertices but the Pattern is shown only the first: the stand-in for
    # a pipeline whose `pivots` is not the detector its `source` was built on.
    with pytest.raises(ValueError, match="no vertex at"):
        run(bars, (0, None, "high"), (19, 12, "low"), pivots_shown=1)
