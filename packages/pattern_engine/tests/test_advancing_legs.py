"""Tests for the filter that drops the pushes that got nowhere, and its adapter.

Two layers, tested apart, as `test_nested_legs.py` does it. `advancing_legs` is handed `Leg`s and
a side map built by hand, so a leg can be given *exactly* the last bar the rule needs to read —
which no detector can be asked to produce. The adapter is then checked for what an adapter
promises, and one test at the bottom drives the real six-Pattern chain to prove the pieces agree.

Almost every assertion is about which of two nearly identical legs survived, because the rule
reads one number off one bar and reading the wrong one leaves a table that still looks plausible.
"""

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

import pytest

from pattern_engine import BaseSeries, Candle, Direction, SeriesIdentity
from pattern_engine.engine import BARS, INSTRUMENT
from pattern_engine.patterns.advancing_legs import (
    AdvancingLeg,
    AdvancingLegsPattern,
    advancing_legs,
    trim_tail,
)
from pattern_engine.patterns.leg_processor import Leg, LegPattern
from pattern_engine.patterns.leg_window import LegWindowPattern
from pattern_engine.patterns.nested_legs import NestedLegs, NestedLegsPattern
from pattern_engine.patterns.simple_leg import LegMark, SimpleLegPattern
from pattern_engine.patterns.zigzag import ZigZagPattern, ZigZagPivot
from pattern_engine.series import CANDLES

OPEN = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def bar(index: int, high: float, low: float) -> Candle:
    """One bar, at a distinct minute, with only its two extremes made to matter."""
    return Candle(
        time=OPEN + timedelta(minutes=5 * index),
        open=(high + low) / 2,
        high=high,
        low=low,
        close=(high + low) / 2,
        volume=100.0,
    )


def leg(index: int, *bars: tuple[float, float]) -> Leg:
    """A leg starting at bar `index`, its bars given as `(high, low)` pairs.

    Placed directly rather than run through a detector, because what needs saying is what the
    leg's **last** bar reached, and no detector can be asked for a particular number.
    """
    return Leg.anchored(
        bar(index, *bars[0]),
        bars=tuple(bar(index + i, high, low) for i, (high, low) in enumerate(bars)),
    )


def sides(*pairs: tuple[Leg, Direction]) -> dict[datetime, Direction]:
    """The map the rule reads a leg's own direction from, keyed the way the adapter keys it."""
    return {leg.time: direction for leg, direction in pairs}


def triangle(index: int, period: int) -> float:
    """A triangular wave in `-1..1`, so two of them at different periods add to a legible path."""
    phase = index % period
    offset = phase if phase < period // 2 else period - phase
    return 2.0 * offset / (period // 2) - 1.0


def wave(count: int = 160) -> BaseSeries[Candle]:
    """Candles the two detectors genuinely disagree about, which is what this filter needs.

    Three terms, and each earns its place. A **slow** triangle is the move the zigzag sees. A
    **fast** one rides on it, sharp enough to turn against the slow trend, which is what makes
    `simple-leg` mark several times per zigzag leg — a single-scale wave leaves one simple leg per
    group and the filter has nothing to choose between. A small **sine at an incommensurate
    period** then makes the pushes unequal, so some of them fail to clear the one before and the
    rule has something to drop. Deterministic throughout: no randomness, and the numbers below are
    the ones these three terms produce.
    """
    bars = []
    for i in range(count):
        mid = (
            100.0
            + 20.0 * triangle(i, 40)
            + 4.0 * triangle(i, 6)
            + 1.5 * math.sin(i * 1.7)
        )
        bars.append(
            Candle(
                time=OPEN + timedelta(minutes=5 * i),
                open=mid,
                high=mid + 0.5,
                low=mid - 0.5,
                close=mid,
                volume=100.0,
            )
        )
    return BaseSeries(SeriesIdentity(CANDLES, "WIN@N", "5m"), bars)


# --- the tail trim ----------------------------------------------------------------------
#
# `closes` is bar 4 throughout and `after` is bar 5, so a leg's final bar names its own verdict:
# bar 4 or 5 is dropped, bar 3 or 6 is kept.


CLOSES = bar(4, 0.0, 0.0).time
AFTER = bar(5, 0.0, 0.0).time


def test_a_last_leg_ending_on_the_closing_bar_is_dropped():
    early = leg(0, (10.0, 9.0), (11.0, 9.5))
    # Ends on bar 4, the closing vertex — so it says only what `leg-window` says with `end`.
    ends_there = leg(2, (11.0, 9.5), (12.0, 10.0), (12.5, 10.5))
    group = [early, ends_there]

    assert list(trim_tail(group, CLOSES, AFTER)) == [early]


def test_a_last_leg_ending_one_bar_past_the_close_is_dropped():
    early = leg(0, (10.0, 9.0), (11.0, 9.5))
    # Ends on bar 5, one past the vertex. The same restatement, a bar late.
    overshoots = leg(2, (11.0, 9.5), (12.0, 10.0), (12.5, 10.5), (12.6, 10.6))
    group = [early, overshoots]

    assert list(trim_tail(group, CLOSES, AFTER)) == [early]


def test_a_last_leg_ending_two_bars_past_the_close_is_kept():
    """The tolerance is exactly one bar, and this is what says so.

    Without it, `after` could quietly become "anything past the close" and nothing would notice —
    the two rules agree on every leg except this one.
    """
    early = leg(0, (10.0, 9.0), (11.0, 9.5))
    went_somewhere = leg(2, (11.0, 9.5), (12.0, 10.0), (12.5, 10.5), (12.6, 10.6), (13.5, 11.0))
    group = [early, went_somewhere]

    assert list(trim_tail(group, CLOSES, AFTER)) == group


def test_a_last_leg_ending_one_bar_early_leaves_the_group_whole():
    early = leg(0, (10.0, 9.0), (11.0, 9.5))
    # Ends on bar 3, one before the vertex. The other side of the same boundary.
    stops_short = leg(2, (11.0, 9.5), (11.5, 10.0))
    group = [early, stops_short]

    assert list(trim_tail(group, CLOSES, AFTER)) == group


def test_a_window_with_no_bar_past_its_close_is_handled():
    # `after=None` for a window ending on its own close. It must match nothing and drop nothing
    # extra, while the close itself still decides as usual.
    early = leg(0, (10.0, 9.0), (11.0, 9.5))
    ends_there = leg(2, (11.0, 9.5), (12.0, 10.0), (12.5, 10.5))

    assert list(trim_tail([early, ends_there], CLOSES, None)) == [early]
    assert list(trim_tail([early], CLOSES, None)) == [early]


def test_only_the_last_leg_is_ever_taken():
    # An earlier leg can end on the vertex too — an overlapping `split_legs` boundary, or a leg
    # that simply runs there. The rule is about the group's *last* leg and no other.
    early = leg(0, (10.0, 9.0), (11.0, 9.5), (12.5, 10.5))
    middle = leg(2, (12.5, 10.5), (11.0, 9.0))
    last = leg(4, (11.0, 9.0), (12.5, 10.5), (12.0, 11.0))
    group = [early, middle, last]

    assert list(trim_tail(group, CLOSES, AFTER)) == group


def test_a_one_leg_group_ending_on_the_closing_bar_is_emptied():
    """No size floor. What the group held was restatement, and an empty group is the honest answer.

    Keeping it to avoid an empty group would be keeping a Point for the shape of the output rather
    than for anything it says.
    """
    only = leg(2, (11.0, 9.5), (12.0, 10.0), (12.5, 10.5))

    assert list(trim_tail([only], CLOSES, AFTER)) == []


def test_a_one_leg_group_ending_before_the_close_is_kept():
    # So the rule above does not read as "one-leg groups are emptied": the condition still decides.
    only = leg(2, (11.0, 9.5), (11.5, 10.0))

    assert list(trim_tail([only], CLOSES, AFTER)) == [only]


def test_an_empty_group_survives_the_trim():
    assert list(trim_tail([], CLOSES, AFTER)) == []


# --- the filter -------------------------------------------------------------------------


def test_an_advance_that_makes_no_new_high_is_dropped():
    first = leg(0, (10.0, 9.0), (12.0, 9.5))
    pull = leg(2, (12.0, 9.5), (11.0, 8.0))
    # Ends at 11.5, below the 12.0 the first advance reached. It went up, and it got nowhere.
    failed = leg(4, (11.0, 8.0), (11.5, 8.5))
    group = [first, pull, failed]

    kept = advancing_legs(
        group,
        sides((first, "bullish"), (pull, "bearish"), (failed, "bullish")),
        "bullish",
    )

    assert kept == [first, pull]


def test_a_pullback_is_kept_whatever_it_did():
    first = leg(0, (10.0, 9.0), (12.0, 9.5))
    # Falls nowhere near a new low, and is kept anyway: a pullback is not competing.
    pull = leg(2, (12.0, 9.5), (11.9, 11.0))
    group = [first, pull]

    kept = advancing_legs(group, sides((first, "bullish"), (pull, "bearish")), "bullish")

    assert kept == [first, pull]


def test_the_bearish_group_is_the_mirror():
    first = leg(0, (10.0, 9.0), (8.0, 7.0))
    pull = leg(2, (8.0, 7.0), (9.0, 7.5))
    # Ends at a low of 7.2, above the 7.0 the first advance reached.
    failed = leg(4, (9.0, 7.5), (8.0, 7.2))
    deeper = leg(6, (8.0, 7.2), (7.0, 6.0))
    group = [first, pull, failed, deeper]

    kept = advancing_legs(
        group,
        sides(
            (first, "bearish"), (pull, "bullish"), (failed, "bearish"), (deeper, "bearish")
        ),
        "bearish",
    )

    assert kept == [first, pull, deeper]


def test_an_exact_tie_is_dropped():
    first = leg(0, (10.0, 9.0), (12.0, 9.5))
    # Reaches exactly the running high. Equalling a level is not clearing it.
    tie = leg(2, (12.0, 9.5), (12.0, 10.0))
    group = [first, tie]

    kept = advancing_legs(group, sides((first, "bullish"), (tie, "bullish")), "bullish")

    assert kept == [first]


def test_the_first_advance_of_a_group_is_always_kept():
    # A one-bar nudge with nothing behind it. The seed is unbounded, so it clears by construction.
    first = leg(0, (10.0, 9.0), (10.1, 9.4))
    group = [first]

    kept = advancing_legs(group, sides((first, "bullish")), "bullish")

    assert kept == [first]


def test_a_dropped_advance_does_not_raise_the_running_high():
    first = leg(0, (10.0, 9.0), (12.0, 9.5))
    failed = leg(2, (12.0, 9.5), (11.5, 9.0))
    # Clears 12.0, which is the running high only if `failed` did not move it. Had `failed`'s
    # 11.5 been taken as the new bar to beat, this would still pass — so the test below the
    # assertion is the one that matters: `failed` itself is gone.
    later = leg(4, (11.5, 9.0), (12.5, 10.0))
    group = [first, failed, later]

    kept = advancing_legs(
        group,
        sides((first, "bullish"), (failed, "bullish"), (later, "bullish")),
        "bullish",
    )

    assert kept == [first, later]


def test_a_spike_the_leg_gave_back_is_not_a_new_high():
    first = leg(0, (10.0, 9.0), (12.0, 9.5))
    # Its middle bar prints 13.0 — above the running high — and its last bar closes the leg back
    # at 11.5. The rule reads the last bar, so this leg made no new high.
    spiked = leg(2, (12.0, 9.5), (13.0, 11.0), (11.5, 10.0))
    group = [first, spiked]

    kept = advancing_legs(group, sides((first, "bullish"), (spiked, "bullish")), "bullish")

    assert kept == [first]


def test_an_empty_group_yields_nothing():
    assert advancing_legs([], {}, "bullish") == []


def test_a_group_of_only_pullbacks_keeps_all_of_them():
    one = leg(0, (10.0, 9.0), (9.0, 8.0))
    two = leg(2, (9.0, 8.0), (8.5, 7.5))
    group = [one, two]

    kept = advancing_legs(group, sides((one, "bearish"), (two, "bearish")), "bullish")

    assert kept == [one, two]


# --- the adapter ------------------------------------------------------------------------


def kept_by_trim(group: NestedLegs) -> Sequence[Leg]:
    """One group's legs as the Pattern sees them — after the trim, before the filter.

    Mirrors the adapter's two lines rather than restating the rule, so a test asking what the
    *filter* did is not quietly asserting the trim as well.
    """
    bars, end = group.leg.bars, group.leg.end
    after = bars[end + 1] if end + 1 < len(bars) else None
    return trim_tail(group.inside, bars[end].time, after.time if after else None)


def chain(bars: BaseSeries[Candle]) -> tuple[dict, AdvancingLegsPattern, NestedLegsPattern]:
    """The real pipeline up to and including the filter, run over `bars`.

    Returns the `ctx` it filled plus the two Patterns a test needs to key into it, so a test can
    compare the filter's output against the grouping it filtered.
    """
    zigzag = ZigZagPattern(depth=8, reads=("5m",), emits="5m")
    simple_leg = SimpleLegPattern(reads=("5m",), emits="5m")
    leg_windows = LegWindowPattern(source=zigzag, ahead=5, reads=("5m",), emits="5m")
    simple_legs = LegPattern(source=simple_leg, reads=("5m",), emits="5m")
    nested = NestedLegsPattern(
        source=leg_windows, legs=simple_legs, reads=("5m",), emits="5m"
    )
    advancing = AdvancingLegsPattern(
        source=nested, pivots=zigzag, marks=simple_leg, reads=("5m",), emits="5m"
    )

    ctx = {BARS: {"5m": bars}, INSTRUMENT: "WIN@N"}
    for pattern in (zigzag, simple_leg, leg_windows, simple_legs, nested, advancing):
        ctx[pattern.producer] = pattern.run(ctx)

    return ctx, advancing, nested


def test_the_producer_key_names_the_whole_chain():
    _, advancing, _ = chain(wave())

    assert advancing.producer.startswith("advancing-legs(source=<nested-legs(")
    assert "pivots=<zig-zag(depth=8" in advancing.producer
    assert "marks=<simple-leg(" in advancing.producer


def test_the_series_carries_the_identity_of_this_run():
    ctx, advancing, _ = chain(wave())
    series: BaseSeries[AdvancingLeg] = ctx[advancing.producer]

    assert series.identity == SeriesIdentity(advancing.producer, "WIN@N", "5m")


def test_the_flat_output_is_ordered_by_anchor():
    ctx, advancing, _ = chain(wave())
    times = [point.time for point in ctx[advancing.producer]]

    assert times == sorted(times)
    assert len(times) == len(set(times))


def test_no_groups_yields_an_empty_series():
    # Three distinct sources, so the three `ctx` keys are three keys. What they *are* does not
    # matter: with no groups to walk, neither map is ever read.
    advancing = AdvancingLegsPattern(
        source=ZigZagPattern(depth=1, reads=("5m",), emits="5m"),
        pivots=ZigZagPattern(depth=2, reads=("5m",), emits="5m"),
        marks=ZigZagPattern(depth=3, reads=("5m",), emits="5m"),
        reads=("5m",),
        emits="5m",
    )
    ctx = {INSTRUMENT: "WIN@N"}
    for source in (advancing.source, advancing.pivots, advancing.marks):
        ctx[source.producer] = BaseSeries(SeriesIdentity(source.producer, "WIN@N", "5m"), [])

    assert list(advancing.run(ctx)) == []


def test_a_group_closing_where_the_zigzag_has_no_vertex_raises():
    ctx, advancing, nested = chain(wave())
    # The zigzag's Series replaced by an empty one: every group now closes on a vertex that is
    # not there, which is what a `pivots` pointed at the wrong detector looks like.
    ctx[advancing.pivots.producer] = BaseSeries(
        SeriesIdentity(advancing.pivots.producer, "WIN@N", "5m"), []
    )

    with pytest.raises(ValueError, match="has no vertex at"):
        advancing.run(ctx)


def test_a_trimmed_leg_missing_from_the_marks_does_not_raise():
    """The guard sits behind the trim, which is otherwise invisible from the outside.

    A leg the trim took is not judged, so this Pattern has no opinion about it — including no
    opinion about whether the detector still marks where it opened.
    """
    ctx, advancing, nested = chain(wave())
    grouped: BaseSeries[NestedLegs] = ctx[nested.producer]

    trimmed = {
        leg.time
        for group in grouped
        for leg in group.inside[len(kept_by_trim(group)):]
    }
    assert trimmed, "the wave produces trimmed legs"

    marks: BaseSeries[LegMark] = ctx[advancing.marks.producer]
    ctx[advancing.marks.producer] = BaseSeries(
        marks.identity, [mark for mark in marks if mark.time not in trimmed]
    )

    advancing.run(ctx)


def test_a_leg_opening_where_the_detector_has_no_mark_raises():
    ctx, advancing, _ = chain(wave())
    ctx[advancing.marks.producer] = BaseSeries(
        SeriesIdentity(advancing.marks.producer, "WIN@N", "5m"), []
    )

    with pytest.raises(ValueError, match="has no mark at"):
        advancing.run(ctx)


# --- end to end -------------------------------------------------------------------------


def test_the_survivors_are_a_subsequence_of_what_was_grouped():
    ctx, advancing, nested = chain(wave())
    grouped: BaseSeries[NestedLegs] = ctx[nested.producer]

    placed = [leg.time for group in grouped for leg in group.inside]
    kept = [point.time for point in ctx[advancing.producer]]

    assert kept, "the wave produces legs to filter"
    # A subsequence: nothing invented, nothing reordered, only legs removed.
    remaining = iter(placed)
    assert all(time in remaining for time in kept)


def test_every_pullback_survives_and_only_advances_are_dropped():
    ctx, advancing, nested = chain(wave())
    grouped: BaseSeries[NestedLegs] = ctx[nested.producer]
    kept = {point.time for point in ctx[advancing.producer]}

    marks: BaseSeries[LegMark] = ctx[advancing.marks.producer]
    side = {mark.time: mark.direction for mark in marks}
    turns = {pivot.time: pivot.direction for pivot in ctx[advancing.pivots.producer]}

    dropped = 0
    trimmed = 0
    for group in grouped:
        closes = group.leg.bars[group.leg.end]
        way = turns[closes.time]
        # The trim runs first, so the legs it took are not what this test is about — it asks what
        # the *filter* did, and the filter never saw them.
        inside = kept_by_trim(group)
        trimmed += len(group.inside) - len(inside)

        for leg in inside:
            own = "high" if side[leg.time] == "low" else "low"
            if own != way:
                assert leg.time in kept, "a pullback was dropped"
            elif leg.time not in kept:
                dropped += 1

    assert dropped, "the wave produces advances that get nowhere"
    assert trimmed, "the wave produces groups whose tail is trimmed"


def test_a_groups_first_leg_is_kept_unless_the_trim_took_it():
    """The invariant the earlier rounds were about, now with its one exception named.

    It was once unconditional, held up by a size floor. The floor is gone: a group whose only leg
    ends on the closing bar, or a bar past it, is emptied. Everywhere else the first leg still
    stands.
    """
    ctx, advancing, nested = chain(wave())
    grouped: BaseSeries[NestedLegs] = ctx[nested.producer]
    kept = {point.time for point in ctx[advancing.producer]}

    filled = [group for group in grouped if group.inside]
    assert filled, "the wave fills groups"
    for group in filled:
        survives = group.inside[0].time in kept
        assert survives == bool(kept_by_trim(group))


def test_every_group_opens_with_an_impulse_and_it_survives_unless_trimmed():
    """What the corrected grouping buys, and the one exception the trim leaves in it.

    Simple legs alternate, so a correctly cut group opens with a leg running the zigzag leg's own
    way. That part is unconditional — it is about the grouping, and nothing downstream can change
    it.

    Whether that leg *reaches the output* has exactly one exception: it is also the group's last
    leg and the trim took it, which empties the group. The filter can never be the cause — it keeps
    every pullback and keeps the first advance by construction — so `kept_by_trim` is the whole of
    the exception, and the test states it that way rather than as a subset it happens to pass on.

    **This wave does not produce the exception**: it grows groups of 5 to 11 legs and never a
    one-leg group whose leg ends on the close. So the emptying case is carried by the unit tests
    above, not here, and the loop below runs its `else` branch every time.
    """
    ctx, advancing, nested = chain(wave())
    grouped: BaseSeries[NestedLegs] = ctx[nested.producer]
    roles = {point.time: (point.direction, point.group) for point in ctx[advancing.producer]}

    marks: BaseSeries[LegMark] = ctx[advancing.marks.producer]
    side = {mark.time: mark.direction for mark in marks}
    turns = {pivot.time: pivot.direction for pivot in ctx[advancing.pivots.producer]}

    filled = [group for group in grouped if group.inside]
    assert filled, "the wave fills groups"
    for group in filled:
        # Both sides converted into the leg vocabulary: the zigzag names the *vertex*, the mark
        # names where a leg *starts*, and a leg leaving a low is going up.
        way: Direction = (
            "bullish" if turns[group.leg.bars[group.leg.end].time] == "high" else "bearish"
        )
        opens = group.inside[0]
        own: Direction = "bullish" if side[opens.time] == "low" else "bearish"
        assert own == way, "the group opens with an impulse"

        if not kept_by_trim(group):
            assert opens.time not in roles, "the trim emptied the group"
        else:
            assert opens.time in roles, "an opening leg the trim left is never dropped"
            assert roles[opens.time] == (own, way)


def test_the_direction_fields_say_which_role_each_leg_played():
    ctx, advancing, _ = chain(wave())
    points: BaseSeries[AdvancingLeg] = ctx[advancing.producer]

    roles = {(point.direction == point.group) for point in points}
    assert roles == {True, False}, "both advances and pullbacks survive"
    assert all(point.group in ("bullish", "bearish") for point in points)


def test_a_pivot_series_of_the_wrong_detector_is_not_silently_accepted():
    """The whole point of taking `pivots` and `marks` as instances: a mismatch is loud."""
    ctx, advancing, _ = chain(wave())
    stray = BaseSeries(
        SeriesIdentity(advancing.pivots.producer, "WIN@N", "5m"),
        [
            ZigZagPivot.anchored(
                Candle(time=OPEN, open=1.0, high=1.0, low=1.0, close=1.0, volume=1.0),
                price=1.0,
                direction="high",
                since=None,
            )
        ],
    )
    ctx[advancing.pivots.producer] = stray

    with pytest.raises(ValueError, match="has no vertex at"):
        advancing.run(ctx)
