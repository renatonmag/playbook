"""The time window every read route takes, and the two things that make one invalid.

Shared rather than repeated: `/candles` and `/patterns` must reject the same windows with the
same words, or the same mistake produces two different errors depending on which route saw it.
"""

from datetime import datetime

from fastapi import HTTPException


def validate_window(start: datetime, end: datetime) -> None:
    """Raise 400 unless `[start, end]` is a window the database can be asked about.

    `time` is `timestamptz`. A naive datetime would still compare, against whatever the
    server's timezone happens to be, and silently return the wrong window — so the offset is
    required rather than assumed.
    """
    for name, value in (("from", start), ("to", end)):
        if value.tzinfo is None:
            raise HTTPException(400, f"`{name}` needs a UTC offset, e.g. 2026-08-11T00:00:00Z")

    if start >= end:
        raise HTTPException(400, "`from` must be earlier than `to`")
