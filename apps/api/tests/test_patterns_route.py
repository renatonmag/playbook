"""Tests for the pattern run path. No database: the session is faked.

What is worth testing here is the wiring — that rows become a Series the engine accepts, that
the payload keeps every field, that `time` is seconds everywhere including nested, and that a
Pattern which raises is reported rather than hidden. Which bars the zigzag picks is the
engine's business, and is tested there.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pattern_engine import BaseSeries, Ctx, Pattern, SeriesIdentity
from pattern_engine.patterns import BarsPattern, LegExtremesPattern, LineRelationsPattern

from playbook_api.db import get_session
from playbook_api.lines_body import MAX_LINES
from playbook_api.main import app
from playbook_api.models.candle import Candle
from playbook_api.pipeline import PIPELINE, RULE_K, build_pipeline
from playbook_api.routers import patterns as patterns_router
from playbook_api.schemas.pattern import _seconds
from playbook_api.store.candles import CandleWindowTooLarge, as_series, closed_candles

from test_candles_route import FakeSession

WINDOW = {"from": "2026-08-11T00:00:00Z", "to": "2026-08-12T00:00:00Z"}
OPEN = datetime(2026, 8, 11, 13, 0, tzinfo=UTC)

#: When the last bar of `wave()` opens — the bar the live edge sits on, and the one withheld.
LAST_OPEN = OPEN + timedelta(minutes=5 * 59)

#: Read from the pipeline rather than written out: retuning a Pattern's parameters changes the
#: producer key, and these tests are about the wiring, not about the tuning.
PRODUCERS = [pattern.producer for pattern in PIPELINE]

#: One producer to inspect a payload through. Which one does not matter — every Series crosses
#: the wire by the same schema — so the tests below say `ZIGZAG` only to have something to name.
ZIGZAG = PIPELINE[0].producer

#: The one Pattern a rule override reaches. Derived, like `PRODUCERS`, and for the same reason.
#:
#: Found by **class**, not by position. A predecessor of this constant read `PIPELINE[-1]`, which
#: said the right thing only for as long as the ruled Pattern happened to be declared last: the
#: first Pattern appended after it pointed the constant at an unrelated Series, and the counts
#: below simply stopped responding to the rule while still passing. A retuned parameter, a
#: reordering and an appended Pattern all leave this correct.
BARS = next(pattern.producer for pattern in PIPELINE if isinstance(pattern, BarsPattern))

#: A Series no rule reaches. Named so that the counts below can be shown to come from `bars` and
#: not from a Series that would report the same number whatever the rule said — the failure the
#: note above describes, asserted rather than assumed.
LEG_EXTREMES = next(
    pattern.producer for pattern in PIPELINE if isinstance(pattern, LegExtremesPattern)
)

#: A full override that marks everything, spelled in the short keys `toQuery` emits — so the wire
#: format is under test and not only the parsing. Chosen to be far looser than `RULE_K`, which on
#: the wave below marks nothing at all: every bar there has `wf == wc`, and `RULE_K` requires
#: `wf > wc`. The two are therefore told apart by a count, not by a hope.
LOOSE_RULE = {"pre": "0", "wf": "0", "wc": "1", "bmin": "0", "bmax": "1", "cor": "nunca", "corb": "1"}


def found(body: dict) -> int:
    """How many bars the `bars` Series marked as a `reversal-bar`.

    That one filter and not the whole Series, because it is the only one the Forma rule decides:
    `two-bar`, `inside-bar` and `small-overlap` are answers about two adjacent bars and would go
    on being marked under a rule that admits nothing. Counting them here would put a floor under
    every number below, and `test_a_binding_ratio_is_applied` — which asserts the count reaches
    exactly zero — would fail on marks the parameter it is testing never touched.
    """
    return sum(
        1 for point in body["series"][BARS]["points"] if point["type"] == "reversal-bar"
    )


def wave(count: int = 60) -> list[Candle]:
    """Rows tracing a triangular wave, so the zigzag has unambiguous vertices to find."""
    rows = []
    for i in range(count):
        phase = i % 12
        offset = phase if phase < 6 else 12 - phase
        mid = Decimal(100) + Decimal(offset)
        rows.append(
            Candle(
                symbol="WIN@N",
                timeframe="M5",
                time=OPEN + timedelta(minutes=5 * i),
                open=mid,
                high=mid + Decimal("0.5"),
                low=mid - Decimal("0.5"),
                close=mid,
                volume=1_200_000,
            )
        )
    return rows


@pytest.fixture
def client():
    session = FakeSession(wave())
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    test_client.session = session  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


class Boom(Pattern):
    """A Pattern that always raises, to exercise ADR-0004's swallow."""

    def run(self, ctx: Ctx):
        raise RuntimeError("boom")


class Spy(Pattern):
    """Records the Candles the run was handed, and produces nothing.

    Which bars reached the engine is the question the trim is about, and asking it through a
    detector's output would answer a different one — a zigzag that ignores the newest bar and a
    zigzag that never saw it look the same from outside.
    """

    seen: list[datetime] = []

    def run(self, ctx: Ctx):
        self.seen = [bar.time for bar in ctx["bars"]["5m"]]
        return BaseSeries(SeriesIdentity(self.producer, ctx["instrument"], self.emits), [])


# --- the store's conversion to a Series ----------------------------------------------------


def test_rows_become_a_series_the_engine_can_read():
    series = as_series(wave(3), symbol="win@n", timeframe="5m")
    assert len(series) == 3
    assert series.identity.instrument == "WIN@N"
    assert series.identity.timeframe == "5m"
    assert isinstance(series[0].open, float)
    # `time` stays an aware datetime: the Series orders on it, and only the wire wants seconds.
    assert series[0].time == OPEN


def test_null_volume_becomes_zero():
    rows = wave(1)
    rows[0].volume = None
    assert as_series(rows, symbol="WIN@N", timeframe="5m")[0].volume == 0.0


# --- the trim to closed bars ---------------------------------------------------------------


def test_the_bar_at_the_live_edge_is_withheld():
    """The newest row is the one the Ingestor is still writing, so it is not a bar to read."""
    rows = wave(3)
    kept = closed_candles(rows, edge=rows[-1].time)
    assert [row.time for row in kept] == [OPEN, OPEN + timedelta(minutes=5)]


def test_a_window_that_stops_short_of_the_live_edge_keeps_every_bar():
    """A pinned window: every row in it is strictly older than the bar being written."""
    rows = wave(3)
    kept = closed_candles(rows, edge=rows[-1].time + timedelta(days=1))
    assert [row.time for row in kept] == [row.time for row in rows]


def test_no_live_edge_withholds_nothing():
    """`None` means the table holds no Candle at all, which makes `rows` empty anyway."""
    assert closed_candles([], edge=None) == []
    assert len(closed_candles(wave(2), edge=None)) == 2


# --- serialization -------------------------------------------------------------------------


def test_nested_datetimes_become_seconds():
    """A zigzag Point carries the Candle its leg began on, so the conversion has to recurse."""
    converted = _seconds({"time": OPEN, "since": {"time": OPEN, "open": 1.0}})
    assert converted == {"time": int(OPEN.timestamp()), "since": {"time": int(OPEN.timestamp()), "open": 1.0}}


# --- the route -----------------------------------------------------------------------------


def test_the_declared_pipeline_runs_and_is_keyed_by_producer(client):
    body = client.get("/patterns", params=WINDOW).json()
    # Every declared Pattern, in declaration order — which is run order. Derived from the
    # pipeline so that adding one is a one-line change there and not a failure here.
    assert list(body["series"]) == PRODUCERS
    assert body["failed"] == []
    assert body["series"][ZIGZAG]["identity"] == {
        "producer": ZIGZAG,
        "instrument": "WIN@N",
        "timeframe": "5m",
    }


def test_points_keep_every_field_and_carry_seconds(client):
    points = client.get("/patterns", params=WINDOW).json()["series"][ZIGZAG]["points"]
    assert points, "the wave should produce vertices"
    point = points[0]
    # Total serialization: the anchor bar's OHLCV rides along, which is what makes the screen
    # able to tell a mispriced vertex from a misplaced one.
    assert {"time", "open", "high", "low", "close", "volume", "price", "direction", "since"} == set(point)
    assert isinstance(point["time"], int)
    assert point["direction"] in {"high", "low"}


def test_the_route_takes_no_symbol_or_timeframe(client):
    """The pipeline names the Instrument; the caller chooses the window and nothing else."""
    body = client.get("/patterns", params={**WINDOW, "symbol": "PETR4", "timeframe": "1h"}).json()
    assert body["series"][ZIGZAG]["identity"]["instrument"] == "WIN@N"


def test_a_raising_pattern_is_reported_instead_of_hidden(client, monkeypatch):
    monkeypatch.setattr(patterns_router, "PIPELINE", (Boom(reads=("5m",), emits="5m"),))
    body = client.get("/patterns", params=WINDOW).json()
    assert body["series"] == {}
    assert body["failed"] == ["boom(reads=5m,emits=5m)"]


@pytest.mark.parametrize(
    "window",
    [
        {"from": "2026-08-11T00:00:00", "to": "2026-08-12T00:00:00Z"},
        {"from": "2026-08-12T00:00:00Z", "to": "2026-08-11T00:00:00Z"},
    ],
    ids=["naive-from", "reversed"],
)
def test_an_invalid_window_is_refused(client, window):
    assert client.get("/patterns", params=window).status_code == 400


def test_an_overflowing_window_is_refused_not_truncated(client, monkeypatch):
    def overflow(*args, **kwargs):
        raise CandleWindowTooLarge(1000)

    monkeypatch.setattr(patterns_router, "load_closed_candles", overflow)
    response = client.get("/patterns", params=WINDOW)
    assert response.status_code == 400
    assert "1000" in response.json()["detail"]


def test_the_bar_at_the_live_edge_is_not_handed_to_the_pipeline(client, monkeypatch):
    """The run stops one bar short of the feed, whatever the window's `to` says.

    The fake answers every query with the same rows, so the window's newest bar and the table's
    newest bar are the one bar — which is the case this is about.
    """
    spy = Spy(reads=("5m",), emits="5m")
    monkeypatch.setattr(patterns_router, "PIPELINE", (spy,))

    client.get("/patterns", params=WINDOW)

    assert spy.seen[-1] == LAST_OPEN - timedelta(minutes=5)
    assert LAST_OPEN not in spy.seen


def test_a_window_holding_no_bar_is_answered_not_refused(client):
    """Empty Series, not failures: a Pattern handed no Candles must produce nothing quietly."""
    client.session.rows = []  # type: ignore[attr-defined]

    response = client.get("/patterns", params=WINDOW)
    assert response.status_code == 200
    body = response.json()
    assert body["failed"] == []
    assert all(series["points"] == [] for series in body["series"].values())


# --- the rule override ---------------------------------------------------------------------


def test_no_rule_parameters_runs_the_declared_pipeline_itself(client, monkeypatch):
    """Not an equal tuple — that one. `build_pipeline` is not even called on this path.

    This is the test that stops a future tidy-up from collapsing the branch into
    `build_pipeline(rule or RULE_K)`, which would read better and would quietly make "as before"
    a claim that has to be re-proved rather than one that holds by identity.
    """

    def boom(*args, **kwargs):
        raise AssertionError("the declared pipeline was rebuilt instead of run")

    monkeypatch.setattr(patterns_router, "build_pipeline", boom)
    assert client.get("/patterns", params=WINDOW).status_code == 200


def test_the_default_build_is_the_declared_pipeline():
    assert [pattern.producer for pattern in build_pipeline()] == PRODUCERS
    assert [pattern.producer for pattern in build_pipeline(RULE_K)] == PRODUCERS


def test_an_override_does_not_move_the_producer_keys(client):
    """The whole point of pinning the name: the screen's checked-producer set survives an edit."""
    body = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()
    assert list(body["series"]) == PRODUCERS
    assert body["failed"] == []


def test_an_override_reaches_the_pattern_and_changes_what_it_marks(client):
    strict = client.get("/patterns", params=WINDOW).json()
    loose = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()
    # Not `!=`: which way it moves is the claim. A loosened rule that marked *fewer* bars would
    # pass an inequality and mean the parameters landed in the wrong fields.
    assert found(loose) > found(strict)


def test_the_override_widens_the_whole_series_and_not_only_the_counted_filter(client):
    """The test above counts `reversal-bar` alone; this one counts every mark in the Series.

    Worth both: `found` narrows to the one filter the rule decides, which is what makes it a
    sharp instrument and also what would hide a rule that reached that filter while breaking the
    Series around it. The Point count is the blunt reading, and it has to move the same way.
    """
    strict = client.get("/patterns", params=WINDOW).json()
    loose = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()

    assert len(loose["series"][BARS]["points"]) > len(strict["series"][BARS]["points"])


def test_bars_reports_both_turns(client):
    """Every bar is asked for a bullish turn and a bearish one, asserted on the wire.

    The engine tests make the same claim; this one makes it about what actually crosses the
    schema, where a `direction` could be dropped or flattened without any of them noticing.
    """
    body = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()
    points = body["series"][BARS]["points"]

    directions = {point["direction"] for point in points}
    # Both turns, in one Series, over the same bars. `None` is not asserted present: the
    # triangular wave never contains a bar in its predecessor, so it produces no `inside-bar` at
    # all — which is a fact about the fixture, not about the Pattern.
    assert {"bullish", "bearish"} <= directions
    assert directions <= {"bullish", "bearish", None}
    # And every mark says which filter made it, so the drawing can hue them apart.
    assert {point["type"] for point in points} <= {
        "two-bar",
        "reversal-bar",
        "inside-bar",
        "small-overlap",
    }


def test_a_series_the_rule_does_not_reach_is_unmoved_by_one(client):
    """The control for every count above: `leg-extremes` answers the same however the rule is set.

    Written after the ruled Series was named by position and a Pattern was appended behind it:
    the constant moved, every count came from a Series no rule can change, and the tests above
    went from proving the override to proving nothing while still passing. A Series that ignores
    the rule is exactly what a mis-aimed constant looks like, so it is worth having one on
    record — the counts above are only evidence if this one holds still.
    """
    strict = client.get("/patterns", params=WINDOW).json()
    loose = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()

    def extremes(body):
        return [point["found"] for point in body["series"][LEG_EXTREMES]["points"]]

    assert extremes(strict), "the wave should produce legs"
    # Unmoved by the rule, and three points per leg however the rule is set.
    assert extremes(loose) == extremes(strict)
    assert all(len(leg) == 3 for leg in extremes(loose))


def test_a_binding_ratio_is_applied(client):
    """Otherwise nothing checks that `wcr` is wired rather than parsed and dropped.

    `wcr=0` demands `wc <= 0`; every bar on the wave has `wc == 0.5`, so the frontier bites all
    the way down to nothing while the rest of the rule stays as loose as it was.
    """
    loose = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()
    tightened = client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "wcr": "0"}).json()
    assert found(loose) > 0
    assert found(tightened) == 0


@pytest.mark.parametrize("dropped", list(LOOSE_RULE), ids=list(LOOSE_RULE))
def test_a_half_specified_rule_is_refused(client, dropped):
    """A rule states every field or none. Six numbers from the caller and one from this server
    is a rule nobody can name, and the screen would attribute its marks to `K` regardless."""
    params = {**WINDOW, **{key: value for key, value in LOOSE_RULE.items() if key != dropped}}
    response = client.get("/patterns", params=params)
    assert response.status_code == 400
    # Names what fell out, as `parseRule` does — "invalid" alone sends someone reading source.
    assert dropped in response.json()["detail"]


def test_a_ratio_alone_is_not_a_rule(client):
    response = client.get("/patterns", params={**WINDOW, "wcr": "2"})
    assert response.status_code == 400
    assert "wcr" in response.json()["detail"]


def test_an_empty_ratio_means_no_frontier(client):
    """`toQuery` writes "no proportional frontier" as `wcr=`, and that has to survive the trip.

    The test that fails loudly if someone retypes `wcr` as `float | None`, which reads better and
    answers 422 to the browser's own serialisation.
    """
    absent = client.get("/patterns", params={**WINDOW, **LOOSE_RULE})
    empty = client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "wcr": ""})
    assert empty.status_code == 200
    assert empty.json() == absent.json()


def test_the_rule_name_cannot_be_chosen(client):
    response = client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "name": "J"})
    assert response.status_code == 400
    assert RULE_K.name in response.json()["detail"]


def test_the_direction_cannot_be_chosen(client):
    """`FormaRule` has no such field: the leg decides. Refused rather than silently unread."""
    response = client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "dir": "alta"})
    assert response.status_code == 400
    assert "dir" in response.json()["detail"]


def test_a_body_range_that_can_mark_nothing_is_refused(client):
    response = client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "bmin": "0.8", "bmax": "0.2"})
    assert response.status_code == 400


@pytest.mark.parametrize(
    "wcr", ["nan", "inf", "abc", "11"], ids=["nan", "inf", "not-a-number", "out-of-range"]
)
def test_an_unusable_ratio_is_refused(client, wcr):
    """`float("nan")` parses, and then every comparison against it in `marks` is false — a rule
    that marks nothing, with no error anywhere saying why."""
    assert client.get("/patterns", params={**WINDOW, **LOOSE_RULE, "wcr": wcr}).status_code == 400


@pytest.mark.parametrize(
    "field",
    [{"wf": "49"}, {"wc": "-1"}, {"corb": "2"}, {"cor": "as-vezes"}],
    ids=["percent-not-fraction", "negative", "above-one", "unknown-colour"],
)
def test_an_out_of_range_threshold_is_refused(client, field):
    """422, not 400: a single field's type or range is FastAPI's business, as it is for `limit`.
    Kept apart from the 400 tests so both codes are documented by a test name.

    These matter more than they look. `marks` does not raise on nonsense — it marks nothing — so
    without this the caller sees an empty Series and no way to tell a typo from a strict rule.
    """
    assert client.get("/patterns", params={**WINDOW, **LOOSE_RULE, **field}).status_code == 422


# --- the lines a browser drew ----------------------------------------------------------------


def touching(count: int = 60) -> list[int]:
    """The closed bars of `wave()` whose wicks hold `LINE_PRICE`, by index.

    Derived from the fixture rather than counted by hand, for the reason `PRODUCERS` is: the wave
    is a fixture and the assertions below are about the wiring, not about its shape. The last row
    is dropped because the run never sees it — see `test_the_bar_at_the_live_edge_is_withheld`.
    """
    marks = []
    for row in wave(count)[:-1]:
        if float(row.low) <= LINE_PRICE <= float(row.high):
            marks.append(int(row.time.timestamp()))
    return marks


#: A price the wave's wicks reach and its bodies never cross — every bar of `wave()` opens and
#: closes at its midpoint, so a breakout is impossible there and a touch is the only event this
#: fixture can produce. Enough: which events the arithmetic finds is the engine's business, and
#: what is under test here is that the body reached it at all.
LINE_PRICE = 101.0

#: The Series a body can change, found by class for the reason `BARS` is.
LINES = next(
    pattern.producer for pattern in PIPELINE if isinstance(pattern, LineRelationsPattern)
)

#: One line, anchored on the window's first bar so every later bar is asked about.
PINNED = {"lines": [{"id": "wick:1:high:end", "time": int(OPEN.timestamp()), "price": LINE_PRICE}]}


def test_the_get_runs_the_line_pattern_with_no_lines(client):
    """Present and empty, never absent: an empty Series and a missing key are different facts."""
    body = client.get("/patterns", params=WINDOW).json()
    assert LINES in body["series"]
    assert body["series"][LINES]["points"] == []


def test_a_posted_line_reaches_the_pattern(client):
    body = client.post("/patterns", params=WINDOW, json=PINNED).json()
    points = body["series"][LINES]["points"]

    assert [point["time"] for point in points] == touching()
    assert {point["line"] for point in points} == {"wick:1:high:end"}
    assert {point["kind"] for point in points} == {"touch"}
    # The line's price, not the bar's — and the bar's own OHLCV rides along beside it.
    assert {point["price"] for point in points} == {LINE_PRICE}
    assert {"time", "open", "high", "low", "close", "volume", "line", "price", "kind", "wick", "side", "since"} == set(points[0])


def test_posting_lines_does_not_move_the_producer_keys(client):
    """`PinnedLines.__str__` earning its keep on the wire, as `LOOSE_RULE` does for the rule."""
    posted = client.post("/patterns", params=WINDOW, json=PINNED).json()
    assert list(posted["series"]) == PRODUCERS
    assert posted["failed"] == []


def test_two_bodies_of_different_lines_answer_under_one_key(client):
    """The cost the docstring declares, asserted rather than left as a claim."""
    other = {"lines": [{"id": "b", "time": int(OPEN.timestamp()), "price": LINE_PRICE + 1}]}
    first = client.post("/patterns", params=WINDOW, json=PINNED).json()
    second = client.post("/patterns", params=WINDOW, json=other).json()

    assert list(first["series"]) == list(second["series"])
    assert first["series"][LINES]["points"] != second["series"][LINES]["points"]


def test_the_rest_of_the_pipeline_is_unmoved_by_a_line(client):
    """A line adds data to a question; it must not change any other Series' answer."""
    plain = client.get("/patterns", params=WINDOW).json()
    posted = client.post("/patterns", params=WINDOW, json=PINNED).json()

    assert {key: value for key, value in posted["series"].items() if key != LINES} == {
        key: value for key, value in plain["series"].items() if key != LINES
    }


def test_a_line_whose_bar_is_outside_the_window_is_answered_not_refused(client):
    """The reading the monitor gives a pin that scrolled away — silence, and a 200."""
    away = {"lines": [{"id": "a", "time": int(OPEN.timestamp()) - 86_400, "price": LINE_PRICE}]}
    response = client.post("/patterns", params=WINDOW, json=away)

    assert response.status_code == 200
    assert response.json()["series"][LINES]["points"] == []


def test_an_empty_list_of_lines_is_a_run_with_no_lines(client):
    posted = client.post("/patterns", params=WINDOW, json={"lines": []}).json()
    assert posted["series"][LINES]["points"] == []


def test_two_lines_sharing_an_id_are_refused(client):
    """The ids come back untouched, so a duplicate would report one line's answers twice under a
    name that cannot tell them apart."""
    doubled = {"lines": [PINNED["lines"][0], {**PINNED["lines"][0], "price": 105.0}]}
    response = client.post("/patterns", params=WINDOW, json=doubled)

    assert response.status_code == 400
    assert "wick:1:high:end" in response.json()["detail"]


def test_more_lines_than_the_ceiling_are_refused(client):
    many = {
        "lines": [
            {"id": f"line-{n}", "time": int(OPEN.timestamp()), "price": LINE_PRICE}
            for n in range(MAX_LINES + 1)
        ]
    }
    response = client.post("/patterns", params=WINDOW, json=many)

    assert response.status_code == 400
    assert str(MAX_LINES) in response.json()["detail"]


def test_exactly_the_ceiling_is_allowed(client):
    """The boundary, so the refusal above is a ceiling and not an off-by-one below it."""
    many = {
        "lines": [
            {"id": f"line-{n}", "time": int(OPEN.timestamp()), "price": LINE_PRICE}
            for n in range(MAX_LINES)
        ]
    }
    assert client.post("/patterns", params=WINDOW, json=many).status_code == 200


def test_a_rule_and_lines_travel_together(client):
    """Neither parameter is a choice against the other: the body is the only thing that is new."""
    loose = client.get("/patterns", params={**WINDOW, **LOOSE_RULE}).json()
    both = client.post("/patterns", params={**WINDOW, **LOOSE_RULE}, json=PINNED).json()

    assert found(both) == found(loose)
    assert both["series"][LINES]["points"]


def test_a_half_specified_rule_is_refused_on_the_post_too(client):
    """The same `Depends`, so the same refusal — asserted, because a second handler is where a
    dependency quietly goes missing."""
    params = {**WINDOW, **{key: value for key, value in LOOSE_RULE.items() if key != "wf"}}
    assert client.post("/patterns", params=params, json=PINNED).status_code == 400


def test_an_invalid_window_is_refused_on_the_post_too(client):
    window = {"from": "2026-08-12T00:00:00Z", "to": "2026-08-11T00:00:00Z"}
    assert client.post("/patterns", params=window, json=PINNED).status_code == 400


def test_the_browser_may_preflight_the_post(client):
    """The `POST` is useless from a browser unless CORS admits the method.

    Written after the real failure: `allow_methods` listed `GET` alone, so the preflight this
    body provokes answered 400 and the `POST` never left the page — with nothing on the server
    side to see, because no handler had run. A route the monitor cannot reach is not a route.
    """
    response = client.options(
        "/patterns",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]
