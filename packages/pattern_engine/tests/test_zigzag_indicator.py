"""Tests for the zigzag algorithm itself — `ZigZagIndidicator`, below the Pattern adapter.

`test_zigzag.py` covers what the adapter promises and deliberately pins none of the algorithm's
bar choices. These do the opposite job for two specific defects.

The first: `_find_extremes` used to move `last_high_idx`/`last_low_idx` whenever the rolling
extreme *value* changed, including when the old extreme merely slid out of the window, so the
indices could name a bar that was the extreme of nothing. `_update_legs` then read
`self.highs[that index]` — still `None` — wrote it into `start`, and flipped the leg flag
anyway, so the leg counted as begun and its real start was never recorded.

The second: `_refine_start_points` deleted every mark sitting strictly between two vertices.
`start` records the extreme that was *current when the leg turned*, so a mark between two
vertices is the normal case — the refinement threw away most of the data and kept the
coincidences.

Assertions stay relational where they can, reading the vertices out of the same result rather
than hardcoding indices, so they do not freeze the choices that are still wrong.
`test_the_vertices_do_not_move` is the exception, and on purpose: those values predate both
fixes, and pinning them is the point.
"""

Rows = list[tuple[float, float]]


def raw(rows: Rows, depth: int) -> list[dict]:
    """The indicator's own output — one entry per bar, keys `zz`/`highs`/`lows`/`start`."""
    from pattern_engine.patterns.zigzag import ZigZagIndidicator

    return ZigZagIndidicator([{"high": high, "low": low} for high, low in rows], depth)()


def marked(entries: list[dict], key: str) -> set[int]:
    return {i for i, entry in enumerate(entries) if entry[key] is not None}


def column(entries: list[dict], key: str) -> list:
    return [entry[key] for entry in entries]


#: A turn that recorded nothing before the index fix: two vertices, at bars 2 and 4, and `start`
#: empty on all five bars because the leg flag flipped on an index whose `lows` was still `None`.
#: It also turns at bar 3 — between the two vertices — which the refinement used to delete.
TURN_RECORDS_START: Rows = [(104.5, 102.5), (104.3, 102.5), (100.5, 99.7), (105.7, 101.9), (106.4, 104.6)]

#: One vertex at bar 2; `start` used to land on bar 5, a bar that made no extreme at all.
LEG_TURNS_A: Rows = [(97.7, 97.0), (96.1, 93.7), (98.1, 96.2), (96.7, 93.7), (96.4, 94.6), (97.8, 95.8)]

#: Three vertices; `start` used to miss bar 4 and mark bar 8 instead, neither of which lined up.
LEG_TURNS_B: Rows = [
    (100.5, 98.6),
    (103.9, 103.7),
    (108.0, 106.3),
    (107.3, 105.7),
    (106.2, 103.0),
    (109.6, 108.0),
    (107.2, 104.4),
    (105.1, 104.7),
    (108.1, 106.6),
]

ALL_FIXTURES = ((LEG_TURNS_A, 3), (LEG_TURNS_B, 3), (TURN_RECORDS_START, 2))


class TestUpdateHighsLows:
    """The single condition that decides a bar made an extreme, and reports that it did."""

    @staticmethod
    def indicator(rows: Rows, depth: int):
        from pattern_engine.patterns.zigzag import ZigZagIndidicator

        return ZigZagIndidicator([{"high": high, "low": low} for high, low in rows], depth)

    def test_a_bar_that_makes_the_window_high_is_marked_and_reported(self):
        zigzag = self.indicator([(10, 9), (11, 10), (12, 11), (11, 10)], 3)
        made_high, _ = zigzag._update_highs_lows(3, 12, 9, last_high=11, last_low=10)
        assert made_high is True
        assert zigzag.highs[2] == 12

    def test_an_extreme_sliding_out_of_the_window_marks_nothing(self):
        """The window maximum changed, but the bar that entered is not it.

        This is the whole defect: the value moved, so the old code moved the index too, onto a
        bar it had not marked. Nothing may be recorded and nothing may be reported.
        """
        zigzag = self.indicator([(50, 1), (30, 2), (20, 3)], 3)
        made_high, _ = zigzag._update_highs_lows(3, 50, 1, last_high=60, last_low=0)
        assert made_high is False
        assert zigzag.highs == [None, None, None]

    def test_a_repeated_extreme_is_not_a_new_one(self):
        """A plateau: the entering bar ties the window high, so the first bar of it keeps the mark."""
        zigzag = self.indicator([(10, 9), (12, 11), (12, 10)], 3)
        made_high, _ = zigzag._update_highs_lows(3, 12, 9, last_high=12, last_low=10)
        assert made_high is False
        assert zigzag.highs == [None, None, None]

    def test_a_bar_that_makes_the_window_low_is_marked_and_reported(self):
        zigzag = self.indicator([(10, 9), (11, 10), (12, 8), (11, 10)], 3)
        _, made_low = zigzag._update_highs_lows(3, 12, 8, last_high=11, last_low=9)
        assert made_low is True
        assert zigzag.lows[2] == 8

    def test_the_pass_beyond_the_last_bar_marks_the_last_bar(self):
        """`idx == size` needs no branch: `idx - 1` is already the final bar."""
        zigzag = self.indicator([(10, 9), (11, 10), (12, 11)], 3)
        made_high, _ = zigzag._update_highs_lows(3, 12, 9, last_high=11, last_low=10)
        assert made_high is True
        assert zigzag.highs[-1] == 12


class TestLegStarts:
    """What `start` records: where each leg turned, which is not where its vertex ends up."""

    def test_a_leg_turn_records_its_start(self):
        """Before the index fix this series turned a leg and wrote nothing on any of its bars."""
        entries = raw(TURN_RECORDS_START, depth=2)
        assert marked(entries, "zz"), "fixture must produce vertices at all"
        assert marked(entries, "start"), "a leg turned, so some bar must carry its start"

    def test_a_turn_between_two_vertices_is_kept(self):
        """A leg turns where it turns; the vertex elected afterwards does not erase that.

        Bar 3 is where this series turned, and bars 2 and 4 are the vertices around it.
        `_refine_start_points` used to delete exactly this — every mark strictly inside a leg —
        which is most of them, and is why the chart had almost no leg starts to draw.
        """
        entries = raw(TURN_RECORDS_START, depth=2)
        assert 3 in marked(entries, "start")
        assert 3 not in marked(entries, "zz")

    def test_a_start_holds_an_extreme_of_the_bar_it_sits_on(self):
        """A mark is that bar's own high or low, never some other bar's price.

        This one passes against the pre-fix algorithm too, and is kept as an invariant guard
        rather than a regression test: the old failure was writing `None` over an already-`None`
        slot, which leaves no trace in the output to assert on. What catches that failure is
        `test_a_leg_turn_records_its_start`, through the leg that ends up with no start at all.
        """
        for rows, depth in ALL_FIXTURES:
            entries = raw(rows, depth)
            for index in marked(entries, "start"):
                high, low = rows[index]
                assert entries[index]["start"] in (high, low)

    def test_a_leg_records_its_turn_at_most_once(self):
        """One mark per leg, so dropping the refinement cannot let duplicates through.

        `_update_legs` writes behind `not leg_up`/`not leg_down`, which is what makes `start`
        mean *when* the leg turned rather than wherever it last looked extreme.
        """
        for rows, depth in ALL_FIXTURES:
            entries = raw(rows, depth)
            vertices = sorted(marked(entries, "zz"))
            starts = marked(entries, "start")
            for lower, upper in zip(vertices, vertices[1:]):
                assert len({i for i in starts if lower < i < upper}) <= 1


def test_the_vertices_do_not_move():
    """Neither fix may change which bars are vertices, or their prices — only `start`.

    These values predate both changes, taken from the algorithm as it stood before either.
    Hardcoding them is the point of the test: `ZigZagPattern` emits one Point per surviving
    vertex, so any drift here would silently reshape its Series.
    """
    entries = raw(TURN_RECORDS_START, depth=2)
    assert column(entries, "zz") == [None, None, 99.7, None, 106.4]
    assert column(entries, "highs") == [None, None, None, None, 106.4]
    assert column(entries, "lows") == [None, None, 99.7, None, None]

    entries = raw(LEG_TURNS_B, depth=3)
    assert column(entries, "zz") == [None, None, 108.0, None, 103.0, 109.6, None, None, None]
    assert column(entries, "highs") == [None, None, 108.0, None, None, 109.6, None, None, None]
    assert column(entries, "lows") == [None, None, None, None, 103.0, None, None, None, None]


class TestEdges:
    """Shapes that must keep behaving as they already did."""

    def test_an_empty_series_yields_nothing(self):
        assert raw([], depth=3) == []

    def test_a_depth_wider_than_the_series_marks_nothing(self):
        """No window ever forms, so every entry stays empty — silently, as it always has."""
        entries = raw([(10, 9), (11, 10), (12, 11)], depth=5)
        assert len(entries) == 3
        assert not marked(entries, "zz")

    def test_a_depth_equal_to_the_series_still_runs(self):
        entries = raw([(10, 9), (11, 10), (12, 11)], depth=3)
        assert len(entries) == 3
