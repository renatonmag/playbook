"""The bar interval a Candle covers. See CONTEXT.md's glossary."""

from typing import Literal

Timeframe = Literal["5m", "15m", "1h", "1d"]

#: How many seconds one bar of each Timeframe covers.
#:
#: The mirror of `SECONDS` in `apps/web/app/types/candle.ts`. It exists so a Pattern can ask
#: whether two Candles are *adjacent in time* rather than merely adjacent in an array — a
#: difference that is invisible on `5m` inside a session and decisive across one.
SECONDS: dict[Timeframe, int] = {
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
}
