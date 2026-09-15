"""Tests for the Shape coordinates.

What is worth testing is the identity, the mirror and the degenerate bar — not that division
works. The mirror matters most: the whole bullish half of the Forma factor rides on it.
"""

from datetime import UTC, datetime

import pytest

from pattern_engine import Candle, Shape, shape_of

AT = datetime(2026, 8, 12, 13, 0, tzinfo=UTC)


def bar(open: float, high: float, low: float, close: float) -> Candle:
    return Candle(time=AT, open=open, high=high, low=low, close=close, volume=100.0)


def mirrored(candle: Candle) -> Candle:
    """The same bar reflected across the price axis — what turns a bearish bar into its bullish twin."""
    return Candle(
        time=candle.time,
        open=-candle.open,
        high=-candle.low,
        low=-candle.high,
        close=-candle.close,
        volume=candle.volume,
    )


def test_the_three_parts_sum_to_one():
    shape = shape_of(bar(open=12.0, high=20.0, low=10.0, close=11.0))

    assert shape is not None
    assert shape.upper + shape.lower + shape.body == pytest.approx(1.0)


def test_the_parts_are_fractions_of_the_amplitude():
    # amplitude 10: upper shadow 8, body 1, lower shadow 1
    shape = shape_of(bar(open=12.0, high=20.0, low=10.0, close=11.0))

    assert shape == Shape(upper=0.8, lower=0.1, body=0.1, bear=True)


def test_size_drops_out_so_two_proportional_bars_are_one_shape():
    small = shape_of(bar(open=12.0, high=20.0, low=10.0, close=11.0))
    large = shape_of(bar(open=1200.0, high=2000.0, low=1000.0, close=1100.0))

    assert small == large


def test_facing_swaps_the_shadows_for_the_bullish_reversal():
    shape = shape_of(bar(open=12.0, high=20.0, low=10.0, close=11.0))

    assert shape is not None
    assert shape.facing("bearish") == (shape.upper, shape.lower)
    assert shape.facing("bullish") == (shape.lower, shape.upper)


def test_the_bullish_bar_is_the_vertical_mirror_of_the_bearish_one():
    """One problem, not two: reflecting the price axis maps one direction onto the other."""
    candle = bar(open=12.0, high=20.0, low=10.0, close=11.0)

    bearish = shape_of(candle)
    bullish = shape_of(mirrored(candle))

    assert bearish is not None and bullish is not None
    assert bullish.facing("bullish") == bearish.facing("bearish")
    assert bullish.bear is not bearish.bear


def test_colour_agrees_only_with_its_own_direction():
    bearish_body = shape_of(bar(open=12.0, high=20.0, low=10.0, close=11.0))

    assert bearish_body is not None
    assert bearish_body.agrees("bearish")
    assert not bearish_body.agrees("bullish")


def test_a_bodyless_bar_agrees_with_both_directions():
    """`b = 0` puts open and close in one place, so there is no colour to disagree with."""
    doji = shape_of(bar(open=12.0, high=20.0, low=10.0, close=12.0))

    assert doji is not None
    assert doji.body == 0
    assert doji.agrees("bearish") and doji.agrees("bullish")


def test_a_bar_that_traded_at_one_price_has_no_shape():
    assert shape_of(bar(open=10.0, high=10.0, low=10.0, close=10.0)) is None
