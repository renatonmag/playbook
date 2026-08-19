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
from pattern_engine import Ctx, Pattern

from playbook_api.db import get_session
from playbook_api.main import app
from playbook_api.models.candle import Candle
from playbook_api.pipeline import PIPELINE, RULE_K, build_pipeline
from playbook_api.routers import patterns as patterns_router
from playbook_api.schemas.pattern import _seconds
from playbook_api.store.candles import CandleWindowTooLarge, as_series

from test_candles_route import FakeSession

WINDOW = {"from": "2026-08-11T00:00:00Z", "to": "2026-08-12T00:00:00Z"}
OPEN = datetime(2026, 8, 11, 13, 0, tzinfo=UTC)

#: Read from the pipeline rather than written out: retuning a Pattern's parameters changes the
#: producer key, and these tests are about the wiring, not about the tuning.
PRODUCERS = [pattern.producer for pattern in PIPELINE]

#: One producer to inspect a payload through. Which one does not matter — every Series crosses
#: the wire by the same schema — so the tests below say `ZIGZAG` only to have something to name.
ZIGZAG = PIPELINE[0].producer

#: The one Pattern a rule override reaches. Derived, like `PRODUCERS`, and for the same reason.
LEG_REVERSALS = PIPELINE[-1].producer

#: A full override that marks everything, spelled in the short keys `toQuery` emits — so the wire
#: format is under test and not only the parsing. Chosen to be far looser than `RULE_K`, which on
#: the wave below marks nothing at all: every bar there has `wf == wc`, and `RULE_K` requires
#: `wf > wc`. The two are therefore told apart by a count, not by a hope.
LOOSE_RULE = {"pre": "0", "wf": "0", "wc": "1", "bmin": "0", "bmax": "1", "cor": "nunca", "corb": "1"}


def found(body: dict) -> int:
    """How many bars the `leg-reversals` Series claimed, across every leg in it."""
    return sum(len(point["found"]) for point in body["series"][LEG_REVERSALS]["points"])


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

    monkeypatch.setattr(patterns_router, "load_candles", overflow)
    response = client.get("/patterns", params=WINDOW)
    assert response.status_code == 400
    assert "1000" in response.json()["detail"]


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
