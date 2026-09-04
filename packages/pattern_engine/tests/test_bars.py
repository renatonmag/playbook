"""Tests for the reversal filters run over the whole history, with no leg to narrow them.

The arithmetic itself is tested in `test_leg_reversals.py`, where it was written and where a leg
gives a direction something to mean. What is tested here is only what changes when the leg is
taken away: that both turns are asked of every bar, that each mark says which turn it is for, and
that the one filter with no direction to give says so rather than borrowing one.

The fixtures are restated rather than imported from that module. They are the same bars, but the
comments on them are not the same comments — there, one is read for the side its leg is a
candidate for; here, for both — and a shared constant whose docstring is true of only one caller
is worse than two.
"""

from datetime import UTC, datetime, timedelta

from pattern_engine import BaseSeries, Candle, FormaRule, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.bars import BarMark, BarsPattern
from pattern_engine.patterns.reversal_filters import (
    DEFAULT_EXPANSION,
    DEFAULT_K,
    DEFAULT_SIMILARITY,
)
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)

#: The rule the pipeline runs, minus the `direction` a Pattern refuses to read.
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

#: The same seven numbers with the pre-filter off and the shadow floor lowered to where a
#: symmetric bar clears it. The pre-filter demands `wf > wc` strictly, which no bar can satisfy in
#: both directions at once — so it is the single field standing between this rule and the "marked
#: for both turns" case, and turning it off is how that case is reached.
RULE_SYMMETRIC = FormaRule(
    name="K",
    require_wf_over_wc=False,
    wf_min=0.4,
    wc_max=1.0,
    wc_max_ratio=None,
    body_min=0.0,
    body_max=0.35,
    colour="nunca",
    colour_body_min=1.0,
)

# `(open, high, low, close)`, all with amplitude 10 unless said otherwise, so the expansion test
# has a flat baseline to compare against and never rejects a pair for a reason a test did not mean.

#: upper 0.4, lower 0.4, body 0.2. Marks nothing under `RULE_K` on either side — the body is too
#: small to dominate and both shadows fall short of 0.49 — which is what makes it padding here
#: rather than a bar under test. Under `RULE_SYMMETRIC` it is the bar marked twice.
FILLER = (100.0, 106.0, 96.0, 102.0)
#: body 1.0, bearish. Half of a pair.
BEAR = (110.0, 110.0, 100.0, 100.0)
#: body 1.0, bullish. The other half — and the one that decides a pair's direction.
BULL = (100.0, 110.0, 100.0, 110.0)
#: upper 0.2, lower 0.6, body 0.2, bullish. A hammer: rule K on the *bullish* side only.
HAMMER = (106.0, 110.0, 100.0, 108.0)
#: The vertical mirror — upper 0.6, lower 0.2, body 0.2. Rule K on the bearish side only.
SHOOTER = (104.0, 110.0, 100.0, 102.0)
#: One price, all day. `shape_of` returns None for it, so the two shape-reading filters cannot
#: read it — and `nests` still can.
FLAT = (100.0, 100.0, 100.0, 100.0)
#: Contained in `FILLER` on both sides — 104 under its 106, 98 over its 96. Deliberately invisible
#: to the other two filters, so anything it is listed for is containment.
INSIDE = (99.0, 104.0, 98.0, 102.0)
#: Covers `HAMMER`'s extremes exactly, which is how one bar is made to carry two findings. Its own
#: body of 0.8 is past K's ceiling, so the mother bar is never marked for its shape.
MOTHER = (101.0, 110.0, 100.0, 109.0)
#: `FILLER`'s proportions three points higher, and again three higher still. Three points is the
#: margin that matters: a `FILLER`-shaped bar closes two above its own open and six under its own
#: high, so it clears its predecessor's high only once the level has moved by more than four.
RISEN = (103.0, 109.0, 99.0, 105.0)
HIGHER = (106.0, 112.0, 102.0, 108.0)
#: Bullish, and closing four points over `FILLER`'s high. The plain small overlap.
CLEAR_UP = (104.0, 114.0, 104.0, 112.0)
#: The mirror: bearish, closing twelve under `FILLER`'s low.
CLEAR_DOWN = (92.0, 92.0, 82.0, 84.0)
#: Opens above `FILLER`'s high and sells off, closing two over it — bearish the whole way. Small
#: overlap by every measure except the one the rule names, which is the bar's own colour.
BEAR_OVER = (114.0, 116.0, 106.0, 108.0)
#: Bullish, closing *exactly* on `FILLER`'s high. The strictness case.
TOUCHES = (100.0, 108.0, 98.0, 106.0)


def series(
    *specs: tuple[float, float, float, float], start: datetime = OPEN
) -> BaseSeries[Candle]:
    """Candles at five-minute spacing from `start`, one per `(open, high, low, close)`.

    `start` is the session-boundary hook, as in `test_leg_reversals`: two of these concatenated
    across midnight are how a test says "these two bars are one interval apart and still not
    neighbours".
    """
    return BaseSeries(
        SeriesIdentity(CANDLES, "WIN@N", "5m"),
        [
            Candle(
                time=start + timedelta(minutes=5 * i),
                open=spec[0],
                high=spec[1],
                low=spec[2],
                close=spec[3],
                volume=100.0,
            )
            for i, spec in enumerate(specs)
        ],
    )


def run(
    bars: BaseSeries[Candle],
    *,
    rule: FormaRule = RULE_K,
    k: float = DEFAULT_K,
    similarity: float = DEFAULT_SIMILARITY,
    expansion: float = DEFAULT_EXPANSION,
) -> BaseSeries[BarMark]:
    """Run the Pattern over `bars` alone.

    Two lines, and that is the point of the Pattern: `LegReversalsPattern`'s equivalent helper has
    to build a zigzag Series and a window Series by hand before it can call anything.
    """
    pattern = BarsPattern(
        rule=rule, k=k, similarity=similarity, expansion=expansion, reads=("5m",), emits="5m"
    )
    return pattern.run({BARS: {"5m": bars}, INSTRUMENT: "WIN@N"})


def listed(
    bars: BaseSeries[Candle], points: BaseSeries[BarMark], type: str | None = None
) -> list[tuple[int, str, str | None]]:
    """The marks as `(bar index, type, direction)` — what every assertion here is about.

    The index is looked up rather than carried: a `BarMark` anchors on its bar and has no `at`,
    which is exactly what having no window to index into means. The tests still want to say "the
    third bar", so the lookup lives here instead of in the Point.

    `type` narrows to one filter, because the three are a union over the same bars and each test is
    about one of them. `inside-bar` in particular fires on any repeated fixture bar — a bar with
    the same extremes as the one before it *is* inside it — and padding a fixture with copies of
    `FILLER` would otherwise make every test an inside-bar test.
    """
    at = {bar.time: i for i, bar in enumerate(bars.points)}
    return [
        (at[mark.time], mark.type, mark.direction)
        for mark in points.points
        if type is None or mark.type == type
    ]


def test_a_pair_is_marked_for_the_turn_its_closing_bar_agrees_with():
    bars = series(FILLER, FILLER, FILLER, BEAR, BULL, FILLER)
    marks = listed(bars, run(bars), "two-bar")

    # Both bars of the pair, both bullish: the pair closes on a bullish bar, so it is a candidate
    # bottom whatever came before it. No leg had to be consulted to say so.
    assert marks == [(3, "two-bar", "bullish"), (4, "two-bar", "bullish")]


def test_both_turns_are_found_in_one_history():
    """The whole difference from `leg-reversals`, in one Series.

    A leg is a candidate for exactly one turn, so one leg's marks are all of one direction and the
    opposite pair inside it is invisible. Here the two pairs sit in the same history and both are
    reported, each with its own direction.
    """
    bars = series(FILLER, FILLER, FILLER, BEAR, BULL, FILLER, FILLER, BULL, BEAR, FILLER)
    marks = listed(bars, run(bars), "two-bar")

    assert marks == [
        (3, "two-bar", "bullish"),
        (4, "two-bar", "bullish"),
        (7, "two-bar", "bearish"),
        (8, "two-bar", "bearish"),
    ]


def test_the_forma_rule_is_asked_for_both_sides_and_a_hammer_answers_one():
    bars = series(FILLER, HAMMER, FILLER, SHOOTER, FILLER)
    marks = listed(bars, run(bars), "reversal-bar")

    # One mark each, and opposite ones: the hammer rejects lower prices, the shooter higher ones.
    # Under `leg-reversals` the two would have had to fall in different legs to both be seen.
    assert marks == [(1, "reversal-bar", "bullish"), (3, "reversal-bar", "bearish")]


def test_one_bar_can_be_marked_for_both_turns_at_once():
    bars = series(FILLER, FILLER)
    marks = listed(bars, run(bars, rule=RULE_SYMMETRIC), "reversal-bar")

    # A symmetric bar read with the pre-filter off satisfies the rule either way round, and two
    # marks is the truthful answer rather than a tie to be broken. Bullish first, which is the
    # order `BOTH` declares.
    assert marks == [
        (0, "reversal-bar", "bullish"),
        (0, "reversal-bar", "bearish"),
        (1, "reversal-bar", "bullish"),
        (1, "reversal-bar", "bearish"),
    ]


def test_an_inside_bar_is_marked_once_and_claims_no_direction():
    bars = series(BULL, FILLER, INSIDE, BEAR)
    marks = listed(bars, run(bars), "inside-bar")

    assert marks == [(2, "inside-bar", None)]


def test_a_bar_with_no_amplitude_is_marked_for_containment_and_nothing_else():
    bars = series(BULL, FILLER, FLAT, BEAR)
    marks = listed(bars, run(bars))

    # `shape_of` returns None for it, so both shape-reading filters are skipped — and containment
    # is read off `high` and `low`, which it has. A bar that traded at one price sits inside
    # whatever preceded it, trivially and truthfully.
    assert marks == [(2, "inside-bar", None)]


def test_one_bar_carries_a_containment_mark_and_a_shape_mark_at_once():
    # `HIGHER` rather than `FILLER` in front, so `MOTHER` closes under the high before it: with
    # `FILLER` there the mother bar is a small overlap of its own and the assertion stops being
    # about the bar it means.
    bars = series(HIGHER, MOTHER, HAMMER, FILLER)
    marks = listed(bars, run(bars))

    # Two findings about one bar, in the module's declared per-bar order: containment first, then
    # the rule. Nothing downstream may key a mark on `time` alone.
    assert marks == [(2, "inside-bar", None), (2, "reversal-bar", "bullish")]


def test_a_bull_bar_closing_over_the_previous_high_is_a_small_overlap():
    bars = series(FILLER, FILLER, CLEAR_UP, FILLER)
    marks = listed(bars, run(bars), "small-overlap")

    # Bar 1 repeats bar 0, so it is an inside bar — narrowed away here, and the reason the fixture
    # can afford the repetition at all.
    assert marks == [(2, "small-overlap", "bullish")]


def test_a_bear_bar_closing_under_the_previous_low_is_a_small_overlap():
    # No trailing bar, unlike its bullish twin: `CLEAR_DOWN` leaves the price twelve points under
    # where the fixture started, so a `FILLER` after it would clear *its* high and be a second
    # mark — true, and not what this test is asking about.
    bars = series(FILLER, FILLER, CLEAR_DOWN)
    marks = listed(bars, run(bars), "small-overlap")

    assert marks == [(2, "small-overlap", "bearish")]


def test_a_bear_bar_closing_over_the_previous_high_is_not_a_small_overlap():
    """The colour term, which is the whole of what separates this filter from "closed outside".

    `BEAR_OVER` gapped over `FILLER`'s high and sold off for the rest of the bar, closing two
    points above it. It overlapped its predecessor by nothing at all — and the rule says *bull
    bar*, which it is not. Nor is it the bearish reading: that one measures against the previous
    **low**, twelve points under where this bar closed.
    """
    bars = series(FILLER, FILLER, BEAR_OVER, FILLER)

    assert listed(bars, run(bars), "small-overlap") == []


def test_a_close_exactly_on_the_previous_high_clears_nothing():
    """Strict, the opposite convention to `inside-bar` and for the same reason read backwards.

    Containment counts an equal high, because a high that was not exceeded is a high that
    contained. Here the claim *is* that the close exceeded it, so sitting on it is not enough.
    """
    bars = series(FILLER, FILLER, TOUCHES, FILLER)

    assert listed(bars, run(bars), "small-overlap") == []


def test_the_first_bar_of_the_history_overlaps_nothing():
    # There is no bar before it to have overlapped little with. Same answer `nests` gives, for the
    # same reason: the filter is about a pair, and half a pair is not a small one.
    bars = series(CLEAR_UP, FILLER)

    assert listed(bars, run(bars), "small-overlap") == []


def test_a_small_overlap_does_not_reach_across_a_session_boundary():
    # One bar apart to the second, and still not neighbours. Without this guard the overnight gap
    # would mark a good share of every session's first bar, which says nothing about overlap.
    across = series(FILLER, start=datetime(2026, 8, 12, 23, 55, tzinfo=UTC))
    after = series(CLEAR_UP, start=datetime(2026, 8, 13, 0, 0, tzinfo=UTC))
    whole = BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), [*across.points, *after.points])

    assert listed(whole, run(whole), "small-overlap") == []


def test_one_bar_carries_a_small_overlap_and_a_shape_mark_at_once():
    bars = series(BULL, FILLER, HAMMER, FILLER)
    marks = listed(bars, run(bars))

    # `HAMMER` closes two over `FILLER`'s high and is a hammer while doing it, so both filters have
    # something to say about the same bar — in the module's declared per-bar order, the small
    # overlap ahead of the rule.
    assert marks == [
        (2, "small-overlap", "bullish"),
        (2, "reversal-bar", "bullish"),
    ]


def test_the_marks_come_back_in_bar_order():
    bars = series(FILLER, HAMMER, FILLER, BEAR, BULL, SHOOTER, FILLER)
    points = run(bars).points

    assert [mark.time for mark in points] == sorted(mark.time for mark in points)


def test_bars_nothing_marks_produce_no_points_at_all():
    # One shape, walked up in threes. No pair can alternate, since all three are bullish; none
    # nests in its predecessor, since each range is shifted rather than covered; neither shape
    # clears K; and three points is under the four a bar of these proportions needs to close over
    # the high before it. Every bar was looked at and the Series is still empty — which is what a
    # gap in it means, and why an empty one is not a sign the run did not happen.
    assert list(run(series(FILLER, RISEN, HIGHER)).points) == []


def test_the_producer_key_names_every_dial():
    pattern = BarsPattern(
        rule=RULE_K,
        k=DEFAULT_K,
        similarity=DEFAULT_SIMILARITY,
        expansion=DEFAULT_EXPANSION,
        reads=("5m",),
        emits="5m",
    )

    assert pattern.producer == (
        "bars(rule=K,k=1.0,similarity=0.65,expansion=0.9,reads=5m,emits=5m)"
    )
    # And it does not collide with the key the Candles themselves live under, which is bare.
    assert pattern.producer != BARS
