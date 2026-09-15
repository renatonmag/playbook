"""The PatternEngine — one run of a declared pipeline over one Instrument.

The pipeline is declared in code: which Patterns run, and in what order, is written out by
hand. There is no scheduling, no dependency graph, and no inference. Declaration order is
run order.
"""

import logging
from collections.abc import Mapping, Sequence

from .candles import Candle
from .pattern import Ctx, Pattern
from .series import BaseSeries
from .timeframes import Timeframe

logger = logging.getLogger(__name__)

#: Where the Candles handed to the constructor live in `ctx`. Kept apart from the producer
#: keys, so a Pattern has two modes of reading: `ctx["bars"][tf]` for Candles,
#: `ctx[producer]` for another Pattern's output.
BARS = "bars"
#: The ticker every Series in this run belongs to. One engine, one Instrument.
INSTRUMENT = "instrument"


class PatternEngine:
    """Runs a list of Patterns over one Instrument's Candles, once.

    The engine fetches nothing: Candles are read from the database outside it and handed in
    as `bars`. It is synchronous and serial, so a Pattern that calls the network stalls the
    whole tick.
    """

    def __init__(
        self,
        bars: Mapping[Timeframe, BaseSeries[Candle]],
        patterns: Sequence[Pattern],
    ):
        if not bars:
            raise ValueError("PatternEngine needs at least one Timeframe of Candles")
        self._bars = dict(bars)
        self._patterns = list(patterns)
        # One PatternEngine per Instrument (ADR-0003). A tick walks the universe and builds
        # a throwaway engine per ticker, so mixed Candles here mean the caller built it wrong.
        instruments = {series.identity.instrument for series in self._bars.values()}
        if len(instruments) > 1:
            raise ValueError(
                f"one PatternEngine covers one Instrument, got {sorted(instruments)}"
            )
        self.instrument = instruments.pop()

    @property
    def patterns(self) -> tuple[Pattern, ...]:
        return tuple(self._patterns)

    def run(self) -> Ctx:
        """Execute the pipeline top to bottom and return the `ctx` it filled.

        `ctx` is a memo table for one pass, not a cache: it is discarded when the run ends
        and never made to persist. Every tick starts from zero, so `run()` is idempotent and
        no dedupe is needed.

        When a Pattern raises, the failure is logged, **nothing is written under its key**,
        and the run carries on. A later Pattern that reads that key raises `KeyError` —
        about the missing key, not about the original failure. The log is the only bridge
        between the two. See ADR-0004.
        """
        ctx: Ctx = {BARS: dict(self._bars), INSTRUMENT: self.instrument}
        for pattern in self._patterns:
            try:
                series = pattern.run(ctx)
            except Exception:
                logger.exception(
                    "pattern %s raised on %s; nothing written to ctx",
                    pattern.producer,
                    self.instrument,
                )
                continue
            ctx[pattern.producer] = series
        return ctx
