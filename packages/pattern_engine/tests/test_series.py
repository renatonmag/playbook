import pytest

from conftest import at, candles
from pattern_engine import BaseSeries, Candle, SeriesIdentity


def empty() -> BaseSeries[Candle]:
    return BaseSeries(SeriesIdentity("stub", "PETR4", "5m"), [])


def test_empty_series_is_falsy():
    assert not empty()
    assert len(empty()) == 0
    assert list(empty()) == []


def test_populated_series_is_truthy_and_indexable():
    series = candles()
    assert series
    assert len(series) == 3
    assert series[0].close == 10.0
    assert series[-1].close == 12.0


def test_as_of_returns_the_point_in_effect():
    series = candles()
    assert series.as_of(at(0)) is series[0]  # exactly on the anchor
    assert series.as_of(at(3)) is series[0]  # between anchors: the last one at or before
    assert series.as_of(at(5)) is series[1]
    assert series.as_of(at(999)) is series[-1]  # past the end: still in effect


def test_as_of_before_the_first_point_is_none():
    assert candles().as_of(at(-1)) is None


def test_as_of_on_an_empty_series_is_none():
    assert empty().as_of(at(0)) is None


def test_points_out_of_order_raise():
    series = candles()
    with pytest.raises(ValueError, match="not ordered"):
        BaseSeries(series.identity, list(reversed(series.points)))


def test_to_dict_carries_identity_and_payload():
    payload = candles().to_dict()
    assert payload["identity"] == {
        "producer": "candles",
        "instrument": "PETR4",
        "timeframe": "5m",
    }
    assert len(payload["points"]) == 3
    assert payload["points"][0]["close"] == 10.0
    assert payload["points"][0]["time"] == at(0)
