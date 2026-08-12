import logging
from dataclasses import dataclass

import pytest

from conftest import candles
from pattern_engine import (
    BaseSeries,
    Candle,
    Ctx,
    Pattern,
    PatternEngine,
    SeriesIdentity,
    Timeframe,
)


@dataclass(frozen=True, slots=True)
class Close(Candle):
    value: float


class Closes(Pattern):
    """Packs one Point per Candle — the shape of an indicator."""

    def __init__(self, *, emits: Timeframe = "5m"):
        super().__init__(reads=(emits,), emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries:
        bars = ctx["bars"][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx["instrument"], self.emits),
            [Close.anchored(candle, value=candle.close) for candle in bars],
        )


class Downstream(Pattern):
    """Consumes another Pattern's output by asking `ctx` for its producer key."""

    def __init__(self, *, upstream: str, emits: Timeframe = "5m"):
        super().__init__(reads=(emits,), emits=emits)
        self.upstream = upstream

    def run(self, ctx: Ctx) -> BaseSeries:
        source = ctx[self.upstream]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx["instrument"], self.emits), list(source)
        )


class Exploding(Pattern):
    def __init__(self, *, emits: Timeframe = "5m"):
        super().__init__(reads=(emits,), emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries:
        raise RuntimeError("the rule blew up")


def test_run_writes_each_output_under_its_producer_key(bars):
    upstream = Closes()
    ctx = PatternEngine(bars, [upstream]).run()

    assert ctx[upstream.producer].identity.producer == upstream.producer
    assert len(ctx[upstream.producer]) == 3
    # The Point carries the bar it occurred on, not only a reference to its time.
    assert ctx[upstream.producer][0].value == bars["5m"][0].close
    assert ctx[upstream.producer][0].high == bars["5m"][0].high


def test_a_pattern_reads_what_an_earlier_one_produced(bars):
    upstream = Closes()
    downstream = Downstream(upstream=upstream.producer)
    ctx = PatternEngine(bars, [upstream, downstream]).run()

    assert len(ctx[downstream.producer]) == 3


def test_declaration_order_is_run_order(bars, caplog):
    upstream = Closes()
    downstream = Downstream(upstream=upstream.producer)

    # The same two Patterns, declared the other way round: nothing reorders them, so the
    # consumer runs before the producer and raises on the key that is not there yet. A
    # mis-written order is discovered at run time, in the log — and nowhere else.
    with caplog.at_level(logging.ERROR):
        ctx = PatternEngine(bars, [downstream, upstream]).run()

    assert downstream.producer not in ctx
    assert upstream.producer in ctx
    assert "KeyError" in caplog.text


def test_ctx_seeds_bars_and_instrument(bars):
    ctx = PatternEngine(bars, []).run()

    assert ctx["instrument"] == "PETR4"
    assert ctx["bars"]["5m"] is bars["5m"]


def test_asking_ctx_for_something_it_does_not_have_raises(bars):
    ctx = PatternEngine(bars, []).run()

    with pytest.raises(KeyError):
        ctx["sma(period=20,emits=5m)"]


def test_a_raising_pattern_is_logged_and_writes_nothing(bars, caplog):
    boom = Exploding()
    with caplog.at_level(logging.ERROR):
        ctx = PatternEngine(bars, [boom]).run()

    assert boom.producer not in ctx
    assert boom.producer in caplog.text
    assert "the rule blew up" in caplog.text


def test_the_tick_carries_on_past_a_raising_pattern(bars, caplog):
    boom = Exploding()
    after = Closes()
    with caplog.at_level(logging.ERROR):
        ctx = PatternEngine(bars, [boom, after]).run()

    assert boom.producer not in ctx
    assert len(ctx[after.producer]) == 3


def test_a_dependent_of_a_raising_pattern_raises_key_error(bars, caplog):
    boom = Exploding()
    dependent = Downstream(upstream=boom.producer)

    with caplog.at_level(logging.ERROR):
        ctx = PatternEngine(bars, [boom, dependent]).run()

    # The dependent raises KeyError about the missing key, not about the original failure —
    # and that KeyError is itself caught and logged. Two log lines, no output, no crash.
    assert boom.producer not in ctx
    assert dependent.producer not in ctx
    assert "the rule blew up" in caplog.text
    assert "KeyError" in caplog.text


def test_one_engine_covers_one_instrument():
    with pytest.raises(ValueError, match="one Instrument"):
        PatternEngine({"5m": candles("PETR4"), "1h": candles("VALE3", "1h")}, [])


def test_an_engine_without_candles_is_refused():
    with pytest.raises(ValueError, match="at least one Timeframe"):
        PatternEngine({}, [])


def test_every_tick_starts_from_zero(bars):
    engine = PatternEngine(bars, [Closes()])
    first, second = engine.run(), engine.run()

    assert first is not second
    assert first.keys() == second.keys()
