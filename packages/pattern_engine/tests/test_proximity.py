"""The ladder that says how near is near, tested where it is decided and nowhere else.

`reach` is the whole of this module's behaviour: a rung is selected by the leg's size, and the
answer is a fraction of that leg. Everything below is one of the four readings that selection can
give — no rung claims the leg, the first does, a middle one does, the last does — plus the two
answers that are not a number at all.

Deliberately no test of what a `close` *is*: that lives in `test_line_relations`, beside the other
three kinds, because it is a question about a bar and this file's question is about a leg.
"""

import pytest
from pattern_engine.patterns.proximity import (
    NO_PROXIMITY,
    ProximityLevel,
    ProximityRule,
    reach,
)

#: Two rungs, ascending, as `lines_body.to_proximity` hands them over: small moves are judged at a
#: tenth, and from a thousand points up at a twentieth. The gap between them is what tells a
#: selection bug from an arithmetic one — a wrong rung answers a number, not an error.
LADDER = ProximityRule(
    name="proximidade",
    levels=(ProximityLevel(points=200.0, trigger=0.1), ProximityLevel(points=1000.0, trigger=0.05)),
)


def test_the_example_the_rule_was_written_from() -> None:
    """A leg of a thousand points at five percent reaches fifty. The sentence, as a test."""
    assert reach(LADDER, 1000.0) == pytest.approx(50.0)


def test_a_leg_below_every_rung_is_not_claimed() -> None:
    """Silence, and it is a setting: the ladder is how somebody says which moves they watch."""
    assert reach(LADDER, 199.0) is None


def test_a_rung_claims_its_own_size() -> None:
    """`points` is the floor of the bucket, inclusive — the leg that is exactly it is in."""
    assert reach(LADDER, 200.0) == pytest.approx(20.0)


def test_a_leg_between_two_rungs_takes_the_lower_one() -> None:
    """A point short of the next rung is still the old bucket — 99.9, on the grid, is 100."""
    assert reach(LADDER, 999.0) == pytest.approx(100.0)


def test_the_last_rung_claims_everything_above_it() -> None:
    """There is no ceiling, and a leg past the top of the ladder is not off it."""
    assert reach(LADDER, 4000.0) == pytest.approx(200.0)


def test_the_fraction_is_of_the_leg_and_not_of_the_rung() -> None:
    """The decision this module exists to make: a bigger leg in one bucket reaches further.

    Two legs within a few points of each other now answer the same reach, because the answer is on
    the tick — the claim here is about a leg two hundred points bigger, which is a scale the grid
    cannot blunt.
    """
    assert reach(LADDER, 1200.0) == pytest.approx(60.0)
    assert reach(LADDER, 1200.0) != reach(LADDER, 1000.0)


def test_a_reach_already_on_the_grid_is_left_alone() -> None:
    """Rounding that moved an exact answer would be the grid inventing a difference."""
    assert reach(LADDER, 1000.0) == pytest.approx(50.0)
    assert reach(LADDER, 300.0) == pytest.approx(30.0)


def test_a_reach_under_the_half_tick_rounds_down() -> None:
    """50.5 is nearer fifty than fifty-five, and the ladder says fifty."""
    assert reach(LADDER, 1010.0) == pytest.approx(50.0)


def test_a_reach_over_the_half_tick_rounds_up() -> None:
    assert reach(LADDER, 1290.0) == pytest.approx(65.0)


def test_a_reach_exactly_on_the_half_tick_rounds_up() -> None:
    """The banker's-rounding trap: `round(62.5 / 5) * 5` is 60, and 65 is what was asked for."""
    assert reach(LADDER, 1250.0) == pytest.approx(65.0)


def test_a_leg_whose_reach_rounds_away_is_claimed_and_says_nothing() -> None:
    """Twenty points at a tenth is two, under half a tick. `0.0`, and no bar is within zero.

    Distinct from the `None` a leg below the ladder gets: a rung took this leg and answered that
    nothing here is near enough to be worth a Point. It takes a ladder reaching lower than `LADDER`
    to get there, which is itself the reason the case is rare.
    """
    fine = ProximityRule(name="proximidade", levels=(ProximityLevel(points=10.0, trigger=0.1),))

    assert reach(fine, 20.0) is not None
    assert reach(fine, 20.0) == pytest.approx(0.0)


def test_a_bar_with_no_leg_is_not_claimed_by_any_ladder() -> None:
    """A window too short to carve a leg, or a Pattern handed no leg Series. One answer for both."""
    assert reach(LADDER, None) is None


def test_an_empty_ladder_claims_nothing_whatever_the_leg() -> None:
    """What a pipeline built without a browser runs, and the reason the fourth kind is off by default."""
    assert reach(NO_PROXIMITY, 5000.0) is None
    assert not NO_PROXIMITY


def test_the_name_is_what_the_producer_key_sees() -> None:
    """The property `__str__` exists for — two ladders, one key. See `PinnedLines.__str__`."""
    assert str(LADDER) == str(NO_PROXIMITY) == "proximidade"
