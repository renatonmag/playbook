"""Tests for the Shape read path. No database: the session is faked.

What is worth testing is the measurement crossing the wire and the bar that has no shape —
plus, once, that the route stayed a measurement and never grew a rule parameter.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from playbook_api.db import get_session
from playbook_api.main import app
from playbook_api.models.candle import Candle

WINDOW = {"from": "2026-08-11T00:00:00Z", "to": "2026-08-12T00:00:00Z"}
QUERY = {"symbol": "WIN@N", "timeframe": "5m", **WINDOW}


def make_row(
    minute: int = 0,
    open: str = "38.20",
    high: str = "39.00",
    low: str = "38.00",
    close: str = "38.10",
) -> Candle:
    """A bearish bar of amplitude 1.00: upper shadow 0.80, body 0.10, lower shadow 0.10."""
    return Candle(
        symbol="WIN@N",
        timeframe="M5",
        time=datetime(2026, 8, 11, 13, 0, tzinfo=UTC) + timedelta(minutes=minute),
        open=Decimal(open),
        high=Decimal(high),
        low=Decimal(low),
        close=Decimal(close),
        volume=1_200_000,
    )


class FakeResult:
    def __init__(self, rows: list[Candle]) -> None:
        self._rows = rows

    def all(self) -> list[Candle]:
        return self._rows


class FakeSession:
    def __init__(self, rows: list[Candle] | None = None) -> None:
        self.rows = rows or []

    def exec(self, statement: object) -> FakeResult:
        return FakeResult(self.rows)


@pytest.fixture
def client():
    session = FakeSession()
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    test_client.session = session  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


def test_returns_the_proportions_and_the_colour(client):
    client.session.rows = [make_row()]
    response = client.get("/shapes", params=QUERY)

    assert response.status_code == 200
    # `approx` because prices are floats by the time they are divided — the same ~1e-14
    # representation error `CandleOut` documents and accepts.
    assert response.json() == [
        {
            "time": int(datetime(2026, 8, 11, 13, 0, tzinfo=UTC).timestamp()),
            "upper": pytest.approx(0.8),
            "lower": pytest.approx(0.1),
            "body": pytest.approx(0.1),
            "bear": True,
            "amplitude": pytest.approx(1.0),
        }
    ]


def test_amplitude_is_size_alone_and_leaves_the_proportions_untouched(client):
    """Two bars of identical form and different size: same three fractions, different amplitude.

    This is issue #10's decision stated as a test. Amplitude rides on `ShapeOut` so a bench can
    draw bars against each other, and the risk of putting it there is that it leaks back into the
    form — a proportion quietly scaled by size would make two identical Shapes compare unequal.
    """
    client.session.rows = [
        make_row(minute=0, open="38.20", high="39.00", low="38.00", close="38.10"),
        make_row(minute=5, open="41.80", high="45.00", low="41.00", close="41.40"),
    ]
    small, large = client.get("/shapes", params=QUERY).json()

    assert large["amplitude"] == pytest.approx(4 * small["amplitude"])
    for part in ("upper", "lower", "body"):
        assert large[part] == pytest.approx(small[part])
    assert large["bear"] == small["bear"]


def test_the_three_parts_sum_to_one(client):
    client.session.rows = [make_row(open="38.55", close="38.90", high="39.00", low="38.00")]
    shape = client.get("/shapes", params=QUERY).json()[0]

    assert shape["upper"] + shape["lower"] + shape["body"] == pytest.approx(1.0)
    assert shape["bear"] is False


def test_a_bar_that_traded_at_one_price_is_omitted(client):
    """No amplitude, no proportions. Omitted rather than nulled — a rule cannot mark it."""
    client.session.rows = [
        make_row(minute=0),
        make_row(minute=5, open="38.50", high="38.50", low="38.50", close="38.50"),
        make_row(minute=10),
    ]
    body = client.get("/shapes", params=QUERY).json()

    assert len(body) == 2
    assert [row["time"] for row in body] == [
        int((datetime(2026, 8, 11, 13, 0, tzinfo=UTC) + timedelta(minutes=minute)).timestamp())
        for minute in (0, 10)
    ]


def test_an_empty_window_is_an_empty_list_not_a_404(client):
    response = client.get("/shapes", params=QUERY)
    assert response.status_code == 200
    assert response.json() == []


def test_it_measures_far_more_bars_than_the_chart_route_will(client):
    """The bench wants the whole history; `/candles`' ceiling of 1000 is not this route's."""
    client.session.rows = [make_row(minute=i) for i in range(1_200)]
    response = client.get("/shapes", params=QUERY)

    assert response.status_code == 200
    assert len(response.json()) == 1_200


def test_overflowing_the_limit_is_a_400(client):
    client.session.rows = [make_row(minute=i) for i in range(3)]
    response = client.get("/shapes", params={**QUERY, "limit": 2})

    assert response.status_code == 400
    assert "narrow it" in response.json()["detail"]


def test_the_route_takes_no_rule_parameters(client):
    """The line `/patterns` draws: the browser composes the rule, never the query string.

    Guards against a well-meaning future commit adding `wf_min` here to "save a round trip" —
    which would put a detection rule on the server with nothing naming it.
    """
    schema = app.openapi()["paths"]["/shapes"]["get"]["parameters"]
    accepted = {parameter["name"] for parameter in schema}

    assert accepted == {"symbol", "timeframe", "from", "to", "limit"}


def test_a_naive_timestamp_is_refused(client):
    response = client.get(
        "/shapes",
        params={"symbol": "WIN@N", "timeframe": "5m", "from": "2026-08-11T00:00:00", "to": "2026-08-12T00:00:00Z"},
    )
    assert response.status_code == 400
    assert "UTC offset" in response.json()["detail"]
