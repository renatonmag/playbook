"""`WS /ws/candles` — the live edge, pushed.

Everything else this API serves is request/response: the client names a window and gets the bars
in it. That is the right shape for a chart you are reading and the wrong one for a chart you are
watching, which is what this route is for.

The transport is a WebSocket; the *source* is still the same database. Playbook's ingestion is
decoupled through Postgres (ADR-0001), so the freshest thing that exists anywhere in the system
is a row in `candles`. This route polls that row and pushes what changed. It is deliberately not
a message queue — ADR-0001 deferred one until "detection needs to react within seconds of a
Candle closing", and a poll on the same database stays inside that decision rather than reversing
it.

The cost of the poll is bounded by the deduplication below: a quiet market produces no frames at
all, so an idle connection is a `SELECT` every 200ms and nothing on the wire.
"""

import contextlib
from collections.abc import Sequence
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pattern_engine import Timeframe
from sqlmodel import Session

from ..db import get_session
from ..models.candle import Candle
from ..schemas.candle import CandleOut
from ..store.candles import load_recent_candles

router = APIRouter()

#: How often the database is asked what is new.
#:
#: Measured against the live table, the forming bar changes about every 1.4s — that is the
#: ingestor's write cadence, not the trade rate. Polling faster than the thing you are watching
#: changes only buys pooler round-trips that find nothing, so this sits comfortably under that
#: interval rather than far below it: nothing is missed, and worst-case staleness is half a
#: second, which is invisible on a 5m chart.
POLL_SECONDS = 0.5

#: How many bars each poll reads. Two, not one: the bar still forming plus the one that just
#: closed. A bar that closes and is immediately succeeded between two polls would otherwise be
#: sent only in its unfinished state and never corrected.
RECENT_COUNT = 2

#: Close code for a request the socket cannot serve — an unknown timeframe, a failing query.
#: 1008 is "policy violation", which is the closest the protocol has to a 400; there is no HTTP
#: response left to carry one by the time the endpoint runs.
POLICY_VIOLATION = 1008


@router.websocket("/ws/candles")
async def stream_candles(
    websocket: WebSocket,
    session: Annotated[Session, Depends(get_session)],
    symbol: Annotated[str, Query(description="Instrument ticker, e.g. WIN@N")],
    timeframe: Annotated[Timeframe, Query(description="Bar interval, lowercase")],
) -> None:
    """Push the newest Candles of one Instrument at one Timeframe as they change.

    Frames are `{"type": "candles", "candles": [...]}`, each candle in `CandleOut`'s shape —
    the same one `/candles` returns, so the client feeds both to the chart unconverted.

    A frame is sent only when something differs from what this connection last sent. Silence
    means "nothing changed", not "the connection is idle"; the reader below is what notices a
    connection that has actually gone away.
    """
    await websocket.accept()

    # Keyed by `time`, so a bar that is still forming is recognised across polls and only its
    # *changes* go out. Bounded by `RECENT_COUNT` — see the prune at the end of each poll.
    sent: dict[int, dict[str, float | int]] = {}

    def read() -> Sequence[Candle]:
        """One poll's worth of rows, in a transaction of its own.

        The `rollback()` is not defensive tidying, and removing it breaks this route outright.
        `get_session` yields **one** `Session` for the whole connection, so without it SQLAlchemy's
        identity map answers every later `SELECT` with the `Candle` objects loaded by the first
        one. The dedup below then correctly reports that nothing changed — and goes on reporting
        it for as long as the tab is open. Measured on a moving table: one frame in eight seconds
        without this line, seven with it.

        Ending the transaction rather than only calling `expire_all()` also settles the other
        half: a read transaction left open for the life of a connection is a pooler slot sitting
        `idle in transaction` for the life of a chart.
        """
        session.rollback()
        return load_recent_candles(
            session, symbol=symbol, timeframe=timeframe, count=RECENT_COUNT
        )

    async def poll(scope: anyio.CancelScope) -> None:
        while True:
            try:
                # The store is synchronous SQLModel over psycopg, and this runs on a loop shared
                # with every other connection this process holds — so it goes to a thread.
                rows = await anyio.to_thread.run_sync(read)
            except Exception as failure:  # noqa: BLE001 - the client gets a reason, the log gets the trace
                await websocket.send_json({"type": "error", "detail": str(failure)})
                await websocket.close(POLICY_VIOLATION)
                # The reader is parked on a socket that will never speak again; ending the whole
                # connection is the only way out of `receive()`.
                scope.cancel()
                return

            fresh = [
                payload
                for payload in (CandleOut.from_row(row).model_dump() for row in rows)
                if sent.get(int(payload["time"])) != payload
            ]

            if fresh:
                await websocket.send_json({"type": "candles", "candles": fresh})
                for payload in fresh:
                    sent[int(payload["time"])] = payload
                # Yesterday's bars can never come back round, and an unbounded dict on a
                # connection held open all session is a leak measured in trading days.
                for stale in sorted(sent)[:-RECENT_COUNT]:
                    del sent[stale]

            await anyio.sleep(POLL_SECONDS)

    async def until_disconnected() -> None:
        """Notice a client that has gone away.

        Without this the loop above could poll a dead socket forever: it only writes when
        something changed, so on a quiet market there is no failing `send` to reveal the
        disconnect. Reading is what makes the socket tell us.
        """
        with contextlib.suppress(WebSocketDisconnect):
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return

    async with anyio.create_task_group() as tasks:

        async def watch() -> None:
            await until_disconnected()
            tasks.cancel_scope.cancel()

        tasks.start_soon(watch)
        tasks.start_soon(poll, tasks.cancel_scope)
