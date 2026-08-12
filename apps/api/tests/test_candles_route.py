"""Tests for the Candle read path. No database: the session is faked.

What is worth testing here is the translation, not the SELECT — the uppercase timeframe, the
`Decimal` prices, the null volume, and the refusal to truncate.
"""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from playbook_api.db import get_session
from playbook_api.main import app
from playbook_api.models.candle import Candle
from playbook_api.schemas.candle import CandleOut
from playbook_api.store.candles import CandleWindowTooLarge, load_candles

WINDOW = {"from": "2026-08-11T00:00:00Z", "to": "2026-08-12T00:00:00Z"}


def make_row(minute: int = 0, volume: int | None = 1_200_000) -> Candle:
    return Candle(
        symbol="WIN@N",
        timeframe="M5",
        time=datetime(2026, 8, 11, 13, minute, tzinfo=UTC),
        open=Decimal("38.40"),
        high=Decimal("38.90"),
        low=Decimal("38.20"),
        close=Decimal("38.70"),
        volume=volume,
    )


class FakeResult:
    def __init__(self, rows: list[Candle]) -> None:
        self._rows = rows

    def all(self) -> list[Candle]:
        return self._rows


class FakeSession:
    """Stands in for a `Session`, and records what it was asked."""

    def __init__(self, rows: list[Candle] | None = None) -> None:
        self.rows = rows or []
        self.statements: list[object] = []

    def exec(self, statement: object) -> FakeResult:
        self.statements.append(statement)
        return FakeResult(self.rows)


@pytest.fixture
def client():
    session = FakeSession()
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    test_client.session = session  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


# --- schemas -----------------------------------------------------------------------------


def test_time_becomes_unix_seconds():
    assert CandleOut.from_row(make_row()).time == int(
        datetime(2026, 8, 11, 13, 0, tzinfo=UTC).timestamp()
    )


def test_decimal_prices_become_floats():
    out = CandleOut.from_row(make_row())
    assert (out.open, out.high, out.low, out.close) == (38.4, 38.9, 38.2, 38.7)


def test_null_volume_becomes_zero():
    assert CandleOut.from_row(make_row(volume=None)).volume == 0.0


# --- store -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("timeframe", "code"), [("5m", "M5"), ("15m", "M15"), ("1h", "H1"), ("1d", "D1")]
)
def test_the_glossary_timeframe_is_translated_to_the_table_code(timeframe, code):
    """The table speaks MetaTrader (`M5`), not the glossary uppercased (`5M`)."""
    session = FakeSession()
    load_candles(
        session,  # type: ignore[arg-type]
        symbol="win@n",
        timeframe=timeframe,
        start=datetime(2026, 8, 11, tzinfo=UTC),
        end=datetime(2026, 8, 12, tzinfo=UTC),
        limit=10,
    )
    bound = session.statements[0].compile().params  # type: ignore[attr-defined]
    assert code in bound.values()
    assert "WIN@N" in bound.values()


def test_a_full_window_is_not_an_overflow():
    session = FakeSession([make_row(minute=i) for i in range(3)])
    rows = load_candles(
        session,  # type: ignore[arg-type]
        symbol="PETR4",
        timeframe="5m",
        start=datetime(2026, 8, 11, tzinfo=UTC),
        end=datetime(2026, 8, 12, tzinfo=UTC),
        limit=3,
    )
    assert len(rows) == 3


def test_one_candle_over_the_limit_raises():
    session = FakeSession([make_row(minute=i) for i in range(4)])
    with pytest.raises(CandleWindowTooLarge):
        load_candles(
            session,  # type: ignore[arg-type]
            symbol="PETR4",
            timeframe="5m",
            start=datetime(2026, 8, 11, tzinfo=UTC),
            end=datetime(2026, 8, 12, tzinfo=UTC),
            limit=3,
        )


# --- router ------------------------------------------------------------------------------


def test_returns_candles_shaped_for_the_chart(client):
    client.session.rows = [make_row()]
    response = client.get("/candles", params={"symbol": "PETR4", "timeframe": "5m", **WINDOW})

    assert response.status_code == 200
    assert response.json() == [
        {
            "time": int(datetime(2026, 8, 11, 13, 0, tzinfo=UTC).timestamp()),
            "open": 38.4,
            "high": 38.9,
            "low": 38.2,
            "close": 38.7,
            "volume": 1200000.0,
        }
    ]


def test_an_empty_window_is_an_empty_list_not_a_404(client):
    response = client.get("/candles", params={"symbol": "PETR4", "timeframe": "5m", **WINDOW})
    assert response.status_code == 200
    assert response.json() == []


def test_overflowing_the_limit_is_a_400(client):
    client.session.rows = [make_row(minute=i) for i in range(3)]
    response = client.get(
        "/candles", params={"symbol": "PETR4", "timeframe": "5m", "limit": 2, **WINDOW}
    )
    assert response.status_code == 400
    assert "narrow it" in response.json()["detail"]


def test_reversed_window_is_a_400(client):
    response = client.get(
        "/candles",
        params={
            "symbol": "PETR4",
            "timeframe": "5m",
            "from": "2026-08-12T00:00:00Z",
            "to": "2026-08-11T00:00:00Z",
        },
    )
    assert response.status_code == 400


def test_a_naive_timestamp_is_refused(client):
    response = client.get(
        "/candles",
        params={
            "symbol": "PETR4",
            "timeframe": "5m",
            "from": "2026-08-11T00:00:00",
            "to": "2026-08-12T00:00:00Z",
        },
    )
    assert response.status_code == 400
    assert "UTC offset" in response.json()["detail"]


def test_an_unknown_timeframe_is_rejected(client):
    response = client.get("/candles", params={"symbol": "PETR4", "timeframe": "3m", **WINDOW})
    assert response.status_code == 422
