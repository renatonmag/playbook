"""The stretches over which a line held — `line-relations` read as runs rather than as events.

`LineRelationsPattern` answers one bar at a time: this bar touched the line, that one broke
through it, this other one crossed and crossed back. What nobody can read off those Points without
doing the work again is the thing a person pinning a level is actually asking about — **how long
the line held**, and from which side.

A **respect group** is that stretch. One line, one run of bars, one side:

```
respect   a maximal run of events on consecutive bars with no definitive breakout in it
```

The rules, and what each one deliberately does not say:

- **Respect is the absence of a definitive breakout, not the presence of a touch.** A breakout is
  definitive when no later `seam` names it as `since` — that is, when nothing undid it. Everything
  else a bar can do about a line leaves the line standing: a touch is a rejection, a seam is a
  crossing taken back, and the breakout a seam undid was never a break at all. So all three extend
  a run and only the definitive breakout ends one.

- **A definitive breakout belongs to no group.** It is the bar that put price on the other side, so
  counting it into the run it ended would claim the line held on a bar that broke it, and counting
  it into the run it opened would claim the new side started with a bar that opened on the old one.
  It is the separator, and separators are not members.

- **The side is the last event that could say.** `side` on a `LineRelation` is where the bar
  *opened*; what a group needs is where price *sat*, and the two coincide on every kind but one. A
  `touch` and an undone `breakout` both opened on the side they held; a `seam` opened on the broken
  side and closed back, so its respected side is the opposite.

  Read off the last event because the events of one run *can* disagree, which is the thing a run of
  seams does. Price changes sides on every crossing, and a crossing that a later one takes back is
  never a definitive breakout, so it never ends the run: break up, seam back down, seam back up is
  one group whose bars respected `below`, `below`, then `above`. The last reading is the one that
  is still true at the anchor, which is where a reader is standing.

  What that costs is worth saying plainly: one side names a stretch that may have had two, so a
  whipsawed run is labelled for the side it *finished* on and not for the side it spent most of
  itself on. The bars are all carried, so a reader who wants the whole story reads them; what this
  field answers is "which side is the line being held from now".

  This is one meaning of `side` across one Series, the same discipline `line_relations` keeps, and
  it is why this is a second Pattern rather than a fourth `kind` there: that field means "where the
  bar opened" on all three of its kinds, and this one cannot.

- **A run of one is a run.** A lone touch with nothing either side of it is a group of one bar. No
  minimum, and no dial for one: a threshold would be a claim about how much respect counts, which
  is the reader's question and not this Pattern's.

- **A bar that says nothing about the line ends the run.** Two events belong to one group only
  when they fall on consecutive bars. Respect is something bars do one after another; a line that
  nobody tested for twenty bars was not being held across them, it was being ignored, and a group
  reaching over that silence would claim a stretch that never happened.

- **The run carries its bars.** They are contiguous because the rule above makes them so, not
  because gaps were filled in, and `bars` is exactly the bars that answered, first to last. That is what the span *covers*, and
  a reader measuring the run — its extreme, its length — never has to go back to the Candles for
  something this Point passed over.

What it costs, stated rather than hidden:

- **The output is sorted, and that is a real difference from its source.** `line_relations`
  arranges its loops so anchors come out non-decreasing without a sort. Here they cannot: a run is
  closed when its line meets a breakout or a quiet bar, and two lines close their runs in whatever
  order those fall. So the Points are collected per line and sorted at the end. Nothing is lost — the
  sort is stable and a Series is defined by its order, not by how it got there — but the trick that
  made the source honest is unavailable here and is not quietly imitated.

- **A lull splits a group, and there is no dial for how long a lull may be.** A level price keeps
  returning to, with quiet stretches in between, reads as several short groups and not as one long
  one. A tolerance — "up to three idle bars still counts" — would be a claim about how much silence
  respect survives, which is the reader's question and not this Pattern's.

- **`since` is `bars[0]` rather than a field.** The Candle docstring says a Pattern whose occurrence
  spans several Candles declares `since`; here the whole run is carried, so a `since` beside it
  would be a second spelling of `bars[0]` and two places for one fact to be wrong. The anchor is
  still the last bar, which is the convention `since..time` describes.

- **A group can end without being closed.** The last run of a line is emitted at the window's edge
  whether or not anything ended it, and it is not marked as still running. A `provisional` flag is
  a claim the next bar might change the Point, and here the next bar can only ever *extend* it: the
  side and every bar already in the run stay exactly what they are.

- **Nothing looks at the lines.** The Points name their line by the id the browser sent, exactly as
  the source does, and this module never sees a `PinnedLines`. It reads a Series and the Candles
  under it, so a line whose bar scrolled out of the window is already absent from what it is given.

- **Cost** is `O(events)` plus the final sort, with one pass per line.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .line_relations import OPPOSITE, LineRelation, Side


@dataclass(frozen=True, slots=True)
class LineRespect(Candle):
    """One stretch over which one line held, anchored on the last bar of the stretch.

    Every field is total — there is one kind here, so nothing is `None` on some of them the way
    three kinds forced on `LineRelation`.
    """

    #: The line's own id, unparsed. See `Line.id`.
    line: str
    #: The line's price. Carried for the reason `LineRelation.price` is: a reader checks the claim
    #: against the bars beside it without going anywhere else.
    price: float
    #: Which side of the line the bars held it from. See the module docstring for how it is read.
    side: Side
    #: The bars that answered, first to last. Consecutive, so this is also the stretch the group
    #: covers: `bars[-1]` is this Point's own anchor, and `bars[0]` is the `since` it does not
    #: separately declare.
    bars: tuple[Candle, ...]


def respected_side(relation: LineRelation) -> Side | None:
    """Which side of the line `relation` says price was holding, or `None`.

    `None` only where `LineRelation.side` is: the bar opened exactly on the line, and no reading of
    it says which side the bar was on.
    """
    if relation.side is None:
        return None

    # A seam opened on the side the earlier breakout had reached and closed back off it, so the
    # side it respected is the one it returned to. Every other kind opened where it stayed.
    return OPPOSITE[relation.side] if relation.kind == "seam" else relation.side


def undone_breakouts(relations: Sequence[LineRelation]) -> set[datetime]:
    """The bars whose breakout a later seam took back, as anchors.

    A seam carries the bar it undid whole, so this is a read of `since` and not a re-derivation of
    the seam rule — the two can never disagree about which crossing was undone.
    """
    return {
        relation.since.time
        for relation in relations
        if relation.kind == "seam" and relation.since is not None
    }


def _closed(
    line: str,
    price: float | None,
    side: Side | None,
    run: list[int],
    bars: Sequence[Candle],
) -> LineRespect | None:
    """The run as a Point, or `None` where there is no group to make of it.

    Two ways to have none, and they are one answer here because they are one fact: an empty run has
    no bars, and a run whose every event opened exactly on the line has no side. Neither is a
    stretch anybody can be shown. `price` is `None` on exactly the empty run — it rides with the
    run rather than being read off whichever event happened to close it.

    The slice is the run itself and not a window over it: consecutive bars are what a run is made
    of, so `bars[first : last + 1]` names the same bars the events fell on.
    """
    if not run or side is None or price is None:
        return None

    first, last = run[0], run[-1]

    return LineRespect.anchored(
        bars[last],
        line=line,
        price=price,
        side=side,
        bars=tuple(bars[first : last + 1]),
    )


def line_respects(
    relations: Sequence[LineRelation], bars: Sequence[Candle]
) -> list[LineRespect]:
    """Every respect group in `relations`, for every line, in bar order.

    `bars` is the window the relations were found in, and is needed for two things a sparse Series
    cannot answer: turning an anchor back into a position, and filling in the bars between two
    events that a run covers but no Point names.

    Takes plain sequences rather than Series, the reason `line_relations` gives: what a group is
    depends on one line's events and the bars under them, and asking for the Series would advertise
    a dependency on their identity that does not exist.
    """
    if not relations or not bars:
        return []

    at_time = {bar.time: at for at, bar in enumerate(bars)}

    # Partitioned rather than sorted: the source is already in bar order, so each line's events come
    # out in order too, and a run is built by walking one line from its first event to its last.
    by_line: dict[str, list[LineRelation]] = {}
    for relation in relations:
        by_line.setdefault(relation.line, []).append(relation)

    found: list[LineRespect] = []

    for line, events in by_line.items():
        undone = undone_breakouts(events)

        # The open run, as the three things emitting it needs: where its events fell, the side it
        # holds, and the price of the line they held. `side` trails the last event that could say
        # rather than the last event outright, so one that opened exactly on the line does not blank
        # a reading already taken merely by being the most recent. All three are cleared together —
        # see `_closed`.
        run: list[int] = []
        side: Side | None = None
        price: float | None = None

        for event in events:
            at = at_time.get(event.time)
            if at is None:
                continue

            if event.kind == "breakout" and event.time not in undone:
                # The bar that broke out may already be in the run, put there by its own touch — a
                # bar opening exactly on the line does both. It is the separator, and separators
                # are not members, so it comes back out before the group is made. What it leaves
                # behind is `side`, and that is right rather than merely convenient: the touch of a
                # bar that went on to break opened on the side the run was holding, so it says the
                # same thing the run's own last event says.
                if run and run[-1] == at:
                    run.pop()

                group = _closed(line, price, side, run, bars)
                if group is not None:
                    found.append(group)
                run, side, price = [], None, None
                continue

            # The quiet bar. `>` rather than `!=` so that a bar carrying two events for one line
            # cannot split the run it sits in the middle of. The source does emit two on one bar:
            # a bar that opens exactly on the line touches it with the base of a wick and crosses
            # it with its close. This was written before that was possible, and needed no change
            # when it became possible.
            if run and at > run[-1] + 1:
                group = _closed(line, price, side, run, bars)
                if group is not None:
                    found.append(group)
                run, side, price = [], None, None

            run.append(at)
            price = event.price
            respected = respected_side(event)
            if respected is not None:
                side = respected

        # The run still open at the window's edge, emitted on the same terms as one a breakout
        # ended. See the module docstring on why it carries no mark saying so.
        group = _closed(line, price, side, run, bars)
        if group is not None:
            found.append(group)

    # The one place this Pattern cannot do what its source does. See the module docstring: runs
    # close per line, and two lines close theirs in whatever order their breakouts fall, so the
    # anchors `BaseSeries` insists on are arrived at here rather than by construction.
    found.sort(key=lambda point: point.time)

    return found


class LineRespectPattern(Pattern):
    """`line_respects`, run over the Points of `source` and the Candles of `emits`.

    **One source, no dials.** `source` is an **instance** rather than a producer key, for the
    reason `LegExtremesPattern` gives: the key is derived from the constructor call, so naming the
    Pattern is the only way to name its key without writing the key out. It must be a
    `LineRelationsPattern` — nothing checks it, and nothing here parses what it produced beyond the
    fields `LineRelation` declares.

    The lines never reach this Pattern. They are `source`'s parameter, and a group names its line
    by the id the events carried, so a pipeline built without a browser produces an empty source
    Series and an empty one here, with no second place for "nobody drew a line" to be spelled.

    Declare it after its source. There is no dependency graph, and the wrong order leaves the key
    unwritten and raises `KeyError` here.

    Output is **sparse**, like its source: one Point per group, and a line that was never touched
    emits nothing.
    """

    name = "Line respect"

    def __init__(
        self, *, source: Pattern, reads: tuple[Timeframe, ...], emits: Timeframe
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source

    def run(self, ctx: Ctx) -> BaseSeries[LineRespect]:
        relations: BaseSeries[LineRelation] = ctx[self.source.producer]
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            line_respects(relations.points, bars.points),
        )
