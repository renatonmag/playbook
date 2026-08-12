import pytest

from pattern_engine import BaseSeries, Ctx, Pattern, SeriesIdentity, Timeframe


class Sma(Pattern):
    def __init__(self, period: int = 9, *, emits: Timeframe = "5m"):
        super().__init__(reads=(emits,), emits=emits)
        self.period = period

    def run(self, ctx: Ctx) -> BaseSeries:
        return BaseSeries(SeriesIdentity(self.producer, ctx["instrument"], self.emits), [])


class WedgeConfirmed(Pattern):
    def __init__(self, *, reads: tuple[Timeframe, ...], emits: Timeframe):
        super().__init__(reads=reads, emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries:
        return BaseSeries(SeriesIdentity(self.producer, ctx["instrument"], self.emits), [])


class Naked(Pattern):
    """No `__init__` of its own — the base's signature is what gets rendered."""

    def run(self, ctx: Ctx) -> BaseSeries:
        return BaseSeries(SeriesIdentity(self.producer, ctx["instrument"], self.emits), [])


def test_producer_key_is_the_class_name_plus_its_parameters():
    assert Sma(period=20, emits="5m").producer == "sma(period=20,emits=5m)"


def test_positional_parameters_are_named_too():
    assert Sma(20).producer == "sma(period=20,emits=5m)"


def test_defaults_appear_in_the_key():
    assert Sma().producer == "sma(period=9,emits=5m)"


def test_two_instances_of_one_class_do_not_collide():
    assert Sma(period=20).producer != Sma(period=50).producer


def test_camel_case_becomes_hyphenated_and_a_pattern_suffix_is_dropped():
    key = WedgeConfirmed(reads=("1h", "5m"), emits="1h").producer
    assert key == "wedge-confirmed(reads=1h|5m,emits=1h)"

    class EngulfingPattern(Naked):
        pass

    assert EngulfingPattern(reads=("5m",), emits="5m").producer.startswith("engulfing(")


def test_a_pattern_without_run_cannot_be_instantiated():
    class Halfway(Pattern):
        pass

    with pytest.raises(TypeError):
        Halfway(reads=("5m",), emits="5m")


def test_reads_and_emits_are_separate():
    pattern = WedgeConfirmed(reads=("1h", "5m"), emits="1h")
    assert pattern.reads == ("1h", "5m")
    assert pattern.emits == "1h"
