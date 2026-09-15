from dataclasses import dataclass

from conftest import candles
from pattern_engine import Candle, Pivot


@dataclass(frozen=True, slots=True)
class Sma(Candle):
    value: float


def test_anchored_carries_the_bar_and_adds_the_payload():
    bar = candles()[1]
    point = Sma.anchored(bar, value=10.5)

    assert point.time == bar.time
    assert (point.open, point.high, point.low, point.close, point.volume) == (
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
    )
    assert point.value == 10.5


def test_a_pivot_is_the_bar_of_the_vertex_plus_which_price_it_is():
    bar = candles()[2]
    pivot = Pivot.anchored(bar, price=bar.high)

    assert isinstance(pivot, Candle)
    assert pivot.time == bar.time
    assert pivot.price == bar.high


def test_anchored_on_candle_itself_copies_the_bar():
    bar = candles()[0]
    assert Candle.anchored(bar) == bar
