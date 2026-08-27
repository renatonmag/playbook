"""Tests for the live push path. No database: the session is faked, as on `/candles`.

What is worth testing here is the *protocol* — which polls produce a frame and which stay
silent — not the SELECT. `POLL_SECONDS` is driven to near-zero so the suite reads the socket at
test speed rather than at chart speed.
"""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from playbook_api import routers
from playbook_api.db import get_session
from playbook_api.main import app
from playbook_api.models.candle import Candle
from playbook_api.store.candles import load_recent_candles


def make_row(minute: int = 0, close: str = "38.70") -> Candle:
    return Candle(
        symbol="WIN@N",
        timeframe="M5",
        time=datetime(2026, 8, 11, 13, minute, tzinfo=UTC),
        open=Decimal("38.40"),
        high=Decimal("38.90"),
        low=Decimal("38.20"),
        close=Decimal(close),
        volume=1_200_000,
    )


class FakeResult:
    def __init__(self, rows: list[Candle]) -> None:
        self._rows = rows

    def all(self) -> list[Candle]:
        return self._rows


class FakeSession:
    """Stands in for a `Session`. `rows` may be reassigned between polls to simulate a tick.

    Note what this fake *cannot* reproduce: a real `Session` has an identity map, and it is the
    reason the route must end its transaction between polls. A fake without one is fresh for
    free, so every test below would pass against a route that streams the same bar forever.
    `rolled_back` is the stand-in — it records the one call whose absence caused that bug.
    """

    def __init__(self, rows: list[Candle] | None = None) -> None:
        self.rows = rows or []
        self.statements: list[object] = []
        self.failure: Exception | None = None
        self.rolled_back = 0

    def rollback(self) -> None:
        self.rolled_back += 1

    def exec(self, statement: object) -> FakeResult:
        self.statements.append(statement)
        if self.failure is not None:
            raise self.failure
        # The store asks for them newest-first and reverses; the fake mirrors that so the rows
        # a test writes down in reading order come back in reading order.
        return FakeResult(list(reversed(self.rows)))


@pytest.fixture(autouse=True)
def fast_polling(monkeypatch):
    monkeypatch.setattr(routers.live, "POLL_SECONDS", 0.001)


@pytest.fixture
def client():
    session = FakeSession()
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    test_client.session = session  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


PARAMS = {"symbol": "WIN@N", "timeframe": "5m"}


# --- store -------------------------------------------------------------------------------


def test_recent_candles_come_back_oldest_first():
    """The query is descending; the answer is not. `update()` refuses a bar out of order."""
    session = FakeSession([make_row(minute=0), make_row(minute=5)])
    rows = load_recent_candles(
        session,  # type: ignore[arg-type]
        symbol="win@n",
        timeframe="5m",
        count=2,
    )
    assert [row.time.minute for row in rows] == [0, 5]


def test_recent_candles_translate_the_timeframe():
    session = FakeSession()
    load_recent_candles(session, symbol="win@n", timeframe="1h", count=2)  # type: ignore[arg-type]
    bound = session.statements[0].compile().params  # type: ignore[attr-defined]
    assert "H1" in bound.values()
    assert "WIN@N" in bound.values()


# --- socket ------------------------------------------------------------------------------


def test_the_first_frame_carries_the_recent_bars(client):
    client.session.rows = [make_row(minute=0), make_row(minute=5)]
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        frame = socket.receive_json()

    assert frame["type"] == "candles"
    assert [candle["time"] for candle in frame["candles"]] == [
        int(datetime(2026, 8, 11, 13, minute, tzinfo=UTC).timestamp()) for minute in (0, 5)
    ]
    assert frame["candles"][0]["close"] == 38.7


def test_an_unchanged_bar_is_not_sent_twice(client):
    """Silence is the answer to a quiet market — the dedup is the whole cost control."""
    client.session.rows = [make_row(minute=0)]
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        socket.receive_json()
        # A bar that has not moved, then one that has. Reaching the second frame at all proves
        # the polls in between sent nothing.
        client.session.rows = [make_row(minute=0, close="38.95")]
        frame = socket.receive_json()

    assert [candle["close"] for candle in frame["candles"]] == [38.95]


def test_a_new_bar_is_pushed(client):
    client.session.rows = [make_row(minute=0)]
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        socket.receive_json()
        client.session.rows = [make_row(minute=0), make_row(minute=5)]
        frame = socket.receive_json()

    # Only the new one: the bar that did not move is not repeated alongside it.
    assert [candle["time"] for candle in frame["candles"]] == [
        int(datetime(2026, 8, 11, 13, 5, tzinfo=UTC).timestamp())
    ]


def test_every_poll_reads_in_a_transaction_of_its_own(client):
    """The regression guard for the bug that made this route send one frame and stop.

    A `Session` held for the whole connection serves its identity map until the transaction
    ends, so without a `rollback()` per poll the route re-reads poll #1\'s values forever. The
    fake has no identity map and so cannot show the staleness itself — the call is the thing
    that can be observed, so the call is what is asserted.
    """
    client.session.rows = [make_row(minute=0)]
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        socket.receive_json()
        client.session.rows = [make_row(minute=0, close="38.95")]
        socket.receive_json()

    # Two frames means at least two polls, and each of them must have started fresh.
    assert client.session.rolled_back >= 2
    assert client.session.rolled_back >= len(client.session.statements)


def test_the_stream_keeps_up_with_a_bar_that_moves_repeatedly(client):
    """One frame then silence was the symptom; three successive moves is the shape of the fix."""
    client.session.rows = [make_row(minute=0, close="38.70")]
    seen = []
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        seen.append(socket.receive_json()["candles"][0]["close"])
        for close in ("38.80", "38.90", "39.00"):
            client.session.rows = [make_row(minute=0, close=close)]
            seen.append(socket.receive_json()["candles"][0]["close"])

    assert seen == [38.70, 38.80, 38.90, 39.00]


def test_a_failing_query_closes_the_socket_with_a_reason(client):
    client.session.failure = RuntimeError("connection dropped")
    with client.websocket_connect("/ws/candles", params=PARAMS) as socket:
        frame = socket.receive_json()

    assert frame == {"type": "error", "detail": "connection dropped"}


def test_an_unknown_timeframe_is_refused(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws/candles", params={"symbol": "WIN@N", "timeframe": "3m"}
        ) as socket:
            socket.receive_json()
