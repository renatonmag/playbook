"""Tests for `PbMark` — the marker that says where a pullback begins.

Two jobs. Most tests pin the invariants the marker promises, so a future rewrite has something to
steer by. The rest are regression tests for defects the class shipped with; each one is written
in the past tense about what the code used to do, and each was watched failing against that
version before the fix landed — which is the only reason to trust it tests anything.

Nothing here pins the direction *seed* to a particular series. `detect_initial_direction` reads
one pair of bars and stops, on purpose — see the module docstring — so a test asserting that it
gets long series right would be asserting a promise the code does not make.

`_prev`, `_pending`, `_direction` and the private methods are addressed directly. `PbMark` is one
stateful walk split across three methods, and driving it bar by bar is the only way to see the
state.
"""

from pattern_engine.patterns.simple_leg import PbMark, integer

#: One row per bar: high, low, close.
Rows = list[tuple[float, float, float]]


def rows(source: Rows, **columns) -> list[dict]:
    """The bars as the marker takes them, plus any extra columns to ride along untouched."""
    return [
        {
            "high": high,
            "low": low,
            "close": close,
            **{name: values[index] for name, values in columns.items()},
        }
        for index, (high, low, close) in enumerate(source)
    ]


def run(source: Rows, **columns) -> list[dict]:
    return PbMark(rows(source, **columns)).extract()


def bar(high: float, low: float, close: float = 0.0) -> dict:
    return {"high": high, "low": low, "close": close}


EMPTY: Rows = []

#: A clean uptrend with one pullback bar, then a resumption. Bar 3 makes the lower low that turns
#: the leg down; bar 4 makes the higher high that turns it back up.
RISING_WITH_PULLBACK: Rows = [
    (10.0, 9.0, 9.5),
    (11.0, 10.0, 10.5),
    (12.0, 11.0, 11.5),
    (11.5, 10.5, 11.0),
    (13.0, 12.0, 12.5),
    (14.0, 13.0, 13.5),
]

#: The mirror: a downtrend whose bar 3 makes the higher high.
FALLING_WITH_PULLBACK: Rows = [
    (14.0, 13.0, 13.5),
    (13.0, 12.0, 12.5),
    (12.0, 11.0, 11.5),
    (12.5, 11.5, 12.0),
    (11.0, 10.0, 10.5),
    (10.0, 9.0, 9.5),
]

#: Four bars that never move. No direction can be read off it.
FLAT: Rows = [(10.0, 9.0, 9.5)] * 4


class TestDetectInitialDirection:
    """The seed: which way the first leg is assumed to have been running."""

    @staticmethod
    def direction(source: Rows) -> str | None:
        return PbMark(rows(source)).detect_initial_direction()

    def test_a_rising_series_is_bull(self):
        assert self.direction(RISING_WITH_PULLBACK) == "bull"

    def test_a_falling_series_is_bear(self):
        assert self.direction(FALLING_WITH_PULLBACK) == "bear"

    def test_a_flat_series_has_no_direction(self):
        assert self.direction(FLAT) is None

    def test_a_series_too_short_to_compare_has_no_direction(self):
        assert self.direction(EMPTY) is None
        assert self.direction([(10.0, 9.0, 9.5)]) is None

    def test_two_of_three_signals_must_come_from_the_same_bar(self):
        """No reading survives into the next bar, so a tie cannot vote with an old one.

        Bar 1 moves its low and nothing else; bar 2 moves its high and ties on the low. Neither
        bar ever showed two agreeing readings, so there is nothing to report. The three flags
        used to latch, so `trending_low` still held bar 1's vote when bar 2's high came in, and
        the pair that answered had never been seen together.
        """
        assert (
            self.direction(
                [
                    (10.0, 9.0, 9.5),
                    (10.0, 9.5, 9.5),  # low up; high and close tied
                    (10.2, 9.5, 9.5),  # high up; low and close tied
                ]
            )
            is None
        )

    def test_a_series_that_only_speaks_late_is_still_read(self):
        """Silence is not an answer: the scan keeps going until some pair says something."""
        assert self.direction([(10.0, 9.0, 9.5), (10.0, 9.0, 9.5), (11.0, 10.0, 10.5)]) == "bull"


class TestInteger:
    """Prices are compared as scaled integers, so the scaling is part of the comparison."""

    def test_it_orders_prices(self):
        assert integer(10.5) > integer(10.4)
        assert integer(0.0) == 0

    def test_two_distinct_prices_do_not_collapse_into_one(self):
        """`int()` truncated, and `price * SCALE` lands just below the integer often enough.

        Around 7% of five-decimal prices multiply to something like `114728.99999999999`, which
        truncated to `114728` — the same value the price one tick lower gave. Two different lows
        then compared as equal and the pullback between them was never seen.
        """
        assert integer(1.14729) != integer(1.14728)

    def test_a_missing_price_does_not_break_comparison(self):
        """Every call site feeds the result straight into `<` or `>`.

        The old `None` guard was worse than the `NaN` it replaced: `None < None` raised
        `TypeError` and took the run down, where a `NaN` merely compares false and the bar marks
        nothing.
        """
        missing = integer(float("nan"))
        assert (missing < integer(10.0)) is False
        assert (missing > integer(10.0)) is False


class TestMarkPullbacks:
    """The turn rule, bar by bar: a bull leg turns on a lower low, a bear leg on a higher high.

    What comes back is the *side* the closing leg ended on — `"high"` for a bull leg, `"low"`
    for a bear one — so the mark and the extreme it prices can never drift apart. `None` is the
    whole of "no turn here".
    """

    @staticmethod
    def marker(direction: str | None, prev: dict | None = None) -> PbMark:
        mark = PbMark([])
        mark._direction = direction
        mark._prev = prev
        return mark

    def test_the_first_bar_marks_nothing_and_becomes_the_reference(self):
        mark = self.marker("bull")
        assert mark.mark_pullbacks(bar(12.0, 11.0)) is None
        assert mark.mark_pullbacks(bar(11.5, 10.5)) == "high"

    def test_a_bull_leg_turns_on_a_lower_low_and_ends_at_a_high(self):
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(11.5, 10.5)) == "high"
        assert mark._direction == "bear"

    def test_a_bull_leg_holds_while_the_low_rises(self):
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(13.0, 11.5)) is None
        assert mark._direction == "bull"

    def test_a_bear_leg_turns_on_a_higher_high_and_ends_at_a_low(self):
        mark = self.marker("bear", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(12.5, 11.5)) == "low"
        assert mark._direction == "bull"

    def test_a_bear_leg_holds_while_the_high_falls(self):
        mark = self.marker("bear", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(11.5, 10.0)) is None
        assert mark._direction == "bear"

    def test_the_side_is_the_leg_that_ended_not_the_one_that_starts(self):
        """Read one line later and every mark would come back inverted.

        The bar that turns a bull leg down is the first bar of a bear leg, and `_direction`
        holds that new leg by the time the call returns. The vertex being priced belongs to the
        leg that just closed.
        """
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(11.5, 10.5)) == "high"
        assert mark._direction == "bear"
        assert mark.mark_pullbacks(bar(12.0, 11.0)) == "low"
        assert mark._direction == "bull"

    def test_an_outside_bar_marks_no_pullback(self):
        """A bar that takes out both extremes says nothing about which way the leg went.

        It made a lower low *and* a higher high, so the turn rule and the continuation rule both
        fire, and marking either would be a coin toss. The guard sits ahead of both branches, so
        this holds in a bear leg as much as a bull one.
        """
        bull = self.marker("bull", prev=bar(12.0, 11.0))
        assert bull.mark_pullbacks(bar(12.5, 10.5)) is None
        assert bull._direction == "bull"

        bear = self.marker("bear", prev=bar(12.0, 11.0))
        assert bear.mark_pullbacks(bar(12.5, 10.5)) is None
        assert bear._direction == "bear"

    def test_an_outside_bar_becomes_the_reference(self):
        """Unmarked, but not unseen: the leg is measured against it from here on.

        So the next turn has to clear the outside bar's own extremes, not the narrower ones the
        leg was holding before it. A lower low that stays inside the outside bar's range is not
        a turn — price never left the range that bar already covered.
        """
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        mark.mark_pullbacks(bar(13.0, 10.0))
        assert mark.mark_pullbacks(bar(12.0, 10.8)) is None
        assert mark.mark_pullbacks(bar(12.0, 9.9)) == "high"

    def test_a_bar_with_no_direction_seeded_marks_nothing(self):
        """With no seed, neither branch matches and there is still an answer.

        The function used to end without a `return`. The `None` flowed into the `pullback`
        column and, one `dropna` later, deleted the bar. It is `None` again today, but as the
        stated "no turn" rather than as a fall-through nobody chose.
        """
        mark = self.marker(None, prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(11.5, 10.5)) is None

    def test_a_bar_with_a_missing_price_marks_nothing(self):
        """A hole in the data is a bar that marks nothing, not a `TypeError` up the stack."""
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        assert mark.mark_pullbacks(bar(float("nan"), float("nan"))) is None

    def test_a_bar_with_a_missing_price_does_not_become_the_reference(self):
        """Adopting it would make every later comparison false and end the marking in silence."""
        mark = self.marker("bull", prev=bar(12.0, 11.0))
        mark.mark_pullbacks(bar(float("nan"), float("nan")))
        assert mark.mark_pullbacks(bar(11.5, 10.5)) == "high"


class TestFindOutsideEdges:
    """The second pass: a mark sitting on a bar its neighbour engulfs moves forward a bar."""

    @staticmethod
    def finder() -> PbMark:
        return PbMark([])

    def test_a_bar_without_a_mark_stays_unmarked(self):
        assert self.finder().find_outside_edges(bar(12.0, 11.0), bar(13.0, 10.0), None) is None

    def test_a_mark_on_a_bar_its_neighbour_does_not_engulf_stays_put(self):
        assert self.finder().find_outside_edges(bar(12.0, 11.0), bar(11.5, 10.5), "high") == "high"

    def test_a_mark_on_an_engulfed_bar_moves_to_the_next_bar(self):
        finder = self.finder()
        assert finder.find_outside_edges(bar(11.0, 10.0), bar(12.0, 9.0), "high") is None
        assert finder.find_outside_edges(bar(12.0, 9.0), bar(11.5, 10.5), None) == "high"

    def test_a_moved_mark_keeps_moving_if_it_lands_on_another_engulfed_bar(self):
        """A carried mark is judged by the same rule as one of the bar's own.

        Three bars, each engulfed by the one after it: the mark walks to the third. The flag used
        to return before the current bar was looked at, so the second bar consumed the mark — and
        the second bar is exactly the kind the shift exists to move marks off of.
        """
        finder = self.finder()
        assert finder.find_outside_edges(bar(11.0, 10.0), bar(12.0, 9.0), "low") is None
        assert finder.find_outside_edges(bar(12.0, 9.0), bar(13.0, 8.0), None) is None
        assert finder.find_outside_edges(bar(13.0, 8.0), bar(12.5, 9.5), None) == "low"

    def test_a_mark_on_the_last_bar_has_nowhere_to_move_and_stays(self):
        assert self.finder().find_outside_edges(bar(12.0, 11.0), None, "low") == "low"

    def test_walking_forward_does_not_change_which_leg_the_mark_belongs_to(self):
        """The walk moves which bar prices the vertex, never which way the closing leg ran.

        This is the case a side kept in a parallel column would get wrong: the mark can land on
        a bar belonging to the *next* leg, and a column read at the landing bar would report
        that leg's side instead of the one that ended.
        """
        for side in ("high", "low"):
            finder = self.finder()
            assert finder.find_outside_edges(bar(11.0, 10.0), bar(12.0, 9.0), side) is None
            assert finder.find_outside_edges(bar(12.0, 9.0), bar(11.5, 10.5), None) == side


class TestExtract:
    """The whole walk: seed, pullbacks, the shift, and the record it returns."""

    @staticmethod
    def column(entries: list[dict], key: str) -> list:
        return [entry[key] for entry in entries]

    def test_every_bar_comes_back_with_both_columns(self):
        entries = run(RISING_WITH_PULLBACK)
        assert len(entries) == len(RISING_WITH_PULLBACK)
        assert all({"pullback", "leg_mark"} <= entry.keys() for entry in entries)

    def test_a_pullback_is_marked_where_the_leg_turns(self):
        entries = run(RISING_WITH_PULLBACK)
        assert self.column(entries, "pullback") == [False, False, False, True, True, False]

    def test_a_falling_leg_turns_on_its_higher_high(self):
        entries = run(FALLING_WITH_PULLBACK)
        assert self.column(entries, "pullback") == [False, False, False, True, True, False]

    def test_the_input_rows_are_left_alone(self):
        source = rows(RISING_WITH_PULLBACK)
        before = [dict(entry) for entry in source]
        PbMark(source).extract()
        assert source == before

    def test_every_bar_gets_a_leg_mark_of_a_known_value(self):
        """A `dropna` used to drop the last bar, and the reassignment aligned by index.

        `high_1`/`low_1` came from `shift(-1)`, so the final bar was always missing them and was
        always dropped from the second pass, coming back `NaN`. `NaN` is not "unmarked" — and
        `if row.leg_mark` on a `NaN` reads as true downstream.
        """
        entries = run(RISING_WITH_PULLBACK)
        assert all(entry["leg_mark"] in ("high", "low", None) for entry in entries)

    def test_a_mark_is_priced_on_the_side_its_leg_ended(self):
        """A rising leg ends at a high, a falling one at a low — the vertex the adapter prices.

        Both fixtures run one leg each way, so between them every mark's side is checked against
        the direction the bars were plainly moving.
        """
        rising = [entry["leg_mark"] for entry in run(RISING_WITH_PULLBACK) if entry["leg_mark"]]
        falling = [entry["leg_mark"] for entry in run(FALLING_WITH_PULLBACK) if entry["leg_mark"]]
        assert rising == ["high", "low"]
        assert falling == ["low", "high"]

    def test_a_gap_in_an_unrelated_column_does_not_move_the_marks(self):
        """The `dropna` was over every column of the frame, including ones nothing ever read.

        One missing `volume` deleted the bar from the second pass, and since that pass carries
        state from bar to bar, the bar after the hole was compared against one that is not its
        neighbour.
        """
        volumes = [100.0, 100.0, None, 100.0, 100.0, 100.0]
        assert self.column(run(RISING_WITH_PULLBACK, volume=volumes), "leg_mark") == self.column(
            run(RISING_WITH_PULLBACK), "leg_mark"
        )

    def test_an_unrelated_column_rides_through_untouched(self):
        volumes = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0]
        assert self.column(run(RISING_WITH_PULLBACK, volume=volumes), "volume") == volumes

    def test_a_flat_series_reports_every_bar_as_unmarked(self):
        """No direction means no pullbacks — which is an answer, and there used to be none.

        `detect_initial_direction` returns `None`, `mark_pullbacks` then returned `None` for
        every bar, and `dropna` deleted the lot. Nothing raised; the caller just got a record
        that said nothing happened on bars that were never looked at.
        """
        entries = run(FLAT)
        assert len(entries) == len(FLAT)
        assert self.column(entries, "pullback") == [False] * len(FLAT)
        assert self.column(entries, "leg_mark") == [None] * len(FLAT)

    def test_every_pullback_leaves_a_leg_mark(self):
        """Nothing is lost between the two passes — the shift moves marks, it does not drop them.

        `dropna` used to delete bars between the passes, so the count could fall. It can still
        fall in one case, documented in the module docstring: two marks walking onto the same bar
        are one mark, because a bar holds one `leg_mark`. Neither fixture here produces that.
        """
        for source in (RISING_WITH_PULLBACK, FALLING_WITH_PULLBACK):
            entries = run(source)
            marks = sum(1 for entry in entries if entry["leg_mark"] is not None)
            assert marks == sum(self.column(entries, "pullback"))

    def test_the_pullback_column_stays_a_bool(self):
        """It says a leg turned here, and nothing about which. The side belongs to the mark.

        The two columns answer about different legs — `pullback` about the one starting, the
        mark about the one that ended — so giving both a side would put two meanings on one
        vocabulary.
        """
        entries = run(RISING_WITH_PULLBACK)
        assert all(entry["pullback"] in (True, False) for entry in entries)

    def test_an_empty_series_yields_nothing(self):
        assert run(EMPTY) == []

    def test_extract_can_be_called_twice(self):
        """`_prev` held a bar in one pass and a bool in the other, and nothing reset it.

        The second call found `_prev` left as `False` by `find_outside_edges`, failed the
        `is None` check, and subscripted a bool. State that survives a call is state the next
        call has to undo.
        """
        mark = PbMark(rows(RISING_WITH_PULLBACK))
        first = mark.extract()
        assert mark.extract() == first

    def test_calling_the_instance_runs_the_extraction(self):
        assert PbMark(rows(RISING_WITH_PULLBACK))() == run(RISING_WITH_PULLBACK)


class TestRunning:
    """The leg that never turned, which is the one no `leg_mark` can ever describe.

    A mark is emitted only when the *next* leg turns, so the leg open at the last bar leaves the
    dense output silent. `running` is the only thing said about it — an attribute rather than a
    column because on any bar it would be indistinguishable from a mark that landed there.
    """

    @staticmethod
    def marker(source: Rows) -> PbMark:
        mark = PbMark(rows(source))
        mark.extract()
        return mark

    def test_a_leg_still_rising_would_end_at_a_high(self):
        # Bar 4's higher high turns the leg back up, and nothing turns it down again.
        assert self.marker(RISING_WITH_PULLBACK).running == "high"

    def test_a_leg_still_falling_would_end_at_a_low(self):
        assert self.marker(FALLING_WITH_PULLBACK).running == "low"

    def test_a_series_with_no_seeded_direction_reports_no_running_leg(self):
        # Nothing was ever running, so there is nothing to report — not a guessed side.
        assert self.marker(FLAT).running is None

    def test_an_empty_series_reports_no_running_leg(self):
        assert self.marker(EMPTY).running is None

    def test_it_is_only_answered_once_the_walk_has_run(self):
        """Read off state the pullback pass leaves behind, so a fresh instance knows nothing."""
        assert PbMark(rows(RISING_WITH_PULLBACK)).running is None

    def test_the_dense_output_gains_no_column_for_it(self):
        entries = run(RISING_WITH_PULLBACK)
        columns = {"high", "low", "close", "pullback", "leg_mark"}
        assert all(entry.keys() == columns for entry in entries)
