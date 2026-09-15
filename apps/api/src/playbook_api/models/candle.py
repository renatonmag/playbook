"""The `candles` table as it exists on Supabase.

**This is not `pattern_engine.Candle`.** That one is a frozen dataclass holding `time` plus
OHLCV and nothing else — it is the domain's Candle, and the root of every Point. This one is
a database row: it carries `symbol` and `timeframe` (which live on a Series' `identity` in the
domain), it is mutable, and it is bound to a SQLAlchemy session. Never hand one of these to
the engine; `store/` is where a row becomes a domain object.
"""

from datetime import datetime
from decimal import Decimal

from sqlmodel import Field, SQLModel


class Candle(SQLModel, table=True):
    """One OHLCV bar, keyed by `(symbol, timeframe, time)` — the table's composite PK.

    `timeframe` is stored uppercase (`5M`, `1H`); a CHECK constraint on the table enforces it.
    Prices are `numeric`, so they arrive as `Decimal`, not `float`.
    """

    __tablename__ = "candles"

    symbol: str = Field(primary_key=True)
    timeframe: str = Field(primary_key=True)
    time: datetime = Field(primary_key=True)
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int | None = None
