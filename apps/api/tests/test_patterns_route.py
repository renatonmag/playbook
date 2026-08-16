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
from playbook_api.pipeline import PIPELINE
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
