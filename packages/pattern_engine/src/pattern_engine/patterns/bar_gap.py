"""The band three bars leave untraded — a gap read across a bar, not at the open.

Three consecutive bars, and one question: did the first bar's range and the third bar's range
miss each other entirely? If they did, the price between them is a stretch the middle bar tore
through and neither neighbour touched.

```
gap up      bar_1.high < bar_3.low      the band is (bar_1.high, bar_3.low)
gap down    bar_1.low  > bar_3.high     the band is (bar_3.high, bar_1.low)
```

This is the simplest structural fact on a chart and nothing in this engine produced it. Every leg
Pattern here measures a move *after* someone has decided where the move is; this one needs no
decision and no source Series — it reads Candles, the way `zigzag.py` and `simple_leg.py` do.

Every gap then answers a second question: **is it still there?** A band price has traded back
through is history; one it has not is a level sitting ahead of price, and that difference is most
of what makes this Series worth drawing.

```
a bull gap closes on the first later bar with   bar.low  <= bottom
a bear gap closes on the first later bar with   bar.high >= top
```

`bottom` is the *far* edge of a bull gap — the near edge is `top`, where bar 3 already sits — so
this is a **full traversal and not a touch**: a bar that dips halfway into the band leaves it open.
`closed_by` carries the bar that did it, or `None` while the gap stands.

The rules:

- **A sliding window of three, stepping one bar.** Overlapping triples are all reported: in a fast
  run bars 1-3 and 2-4 can both gap, and they are two facts, not one counted twice. A caller that
  wants only the widest of an overlapping run has to say so; nothing here guesses.
- **The comparison is strict.** `bar_1.high == bar_3.low` is a touch, and a touch leaves no band.
  There is nothing between two prices that are the same price.
- **`bar_2` is never read.** The rule as stated says nothing about it, and the middle bar of a real
  gap is the bar that made it — constraining it would be a second, quieter opinion about what a gap
  is. A tiny inside bar between two that miss each other is still a gap by this reading.
- **`bottom` and `top`, not direction-dependent field names.** `bottom` is always the lower of the
  two prices and `top` always the higher, whichever way the gap runs, so nothing downstream branches
  on `direction` to find out which number is which. `direction` then carries the one thing the two
  prices cannot say: which way price was going when it left them behind.
- **The close is looked for from the bar *after* the triple.** Bar 3 cannot close its own gap: the
  extreme the rule reads on it *is* the near edge — `bar_3.low == top` on a bull gap — which is the
  far side of the band from `bottom`. Starting the scan past it says so, rather than leaving it to
  be worked out from the arithmetic.
- **The closing comparison is `<=` / `>=`, where the one that creates the gap is strict.** Not an
  inconsistency. Two ranges that touch leave no band to speak of, so a gap needs a real separation;
  but price arriving exactly *at* an existing band's far edge has crossed it, and that is the event
  being looked for.
- **The first qualifying bar wins.** `closed_by` is when the gap died, not the last time price came
  back to it.

What it costs, stated rather than hidden:

- **The anchor is `bar_1`**, so the OHLCV inherited from `Candle` is the *first* bar's and says
  nothing about the gap — the gap is `bottom` and `top`. The same note `LegExtremes` carries about
  its own anchor. Anchoring on the first bar is what keeps anchors strictly increasing across
  overlapping triples, which `BaseSeries` requires, and it is also where a drawing wants to start:
  the box sits over the move that made it.
- **Nothing here is provisional.** `/patterns` hands the engine closed bars only, so a triple that
  completes on the newest bar is a triple that completed. Unlike `simple-leg` and `zig-zag`, no
  Point of this Series moves once it is emitted.
- **`closed_by` is only as good as the window.** The scan runs to the last bar it was handed, so
  "open" means *open as far as this window can see*: the same gap reads open on a short window and
  closed on a longer one that reaches the bar which filled it. There is no lookahead dial to fix
  this with, deliberately — a fixed one would make the answer stable at the price of never
  reporting a late fill, which is the more misleading of the two.
- **A closed gap is still reported**, with its bar attached. Dropping them would make the Series a
  list of levels rather than a record of what happened, and the caller filters.
- **Cost**: one scan per gap, so `O(gaps x bars)` in the worst case. At the density real bars give
  — around 120 gaps over 1400 five-minute Candles — that is nothing. It is written the obvious way
  rather than fused into a single pass because the gaps overlap: one running extreme would be
  correct for the earliest live gap and wrong for every other.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe

#: How many bars a gap is read across. Not a dial: the rule *is* the three-bar rule, and changing
#: this would be a different Pattern wearing this one's name.
SPAN = 3


@dataclass(frozen=True, slots=True)
class BarGap(Candle):
    """The untouched band between the first and third bar of a triple, anchored on the first.

    Carries the band, the direction and the bar that closed it. The two bars that *bound* it are
    not among them: they are the anchor and the one `SPAN - 1` later, derivable from `time` and the
    Timeframe, so restating them would be this Series claiming a fact the Candles already hold.
    `closed_by` is the exception because nothing else knows it — it is the answer to a search, not
    a position.
    """

    #: The lower edge of the band, whichever direction the gap runs. Always below `top`.
    bottom: float
    #: The upper edge of the band. `top - bottom` is the gap's size, and it is always positive.
    top: float
    #: `bullish` for a gap up — the third bar's low sits above the first bar's high — and `bearish`
    #: for its mirror. The one thing the two prices cannot say on their own.
    direction: Direction
    #: The first bar after the triple to trade through the whole band, or `None` while the gap
    #: stands. A whole Candle rather than a timestamp, for the reason `ZigZagPivot.since` carries
    #: one: the bar's own extreme is what the caller wants to check the claim against, and a
    #: timestamp would send it back to the Candles to look it up.
    #:
    #: `None` reads as "not closed *in this window*" and never as "will never close" — see the
    #: module docstring.
    closed_by: Candle | None


def _closed_by(
    bars: Sequence[Candle], after: int, bottom: float, top: float, direction: Direction
) -> Candle | None:
    """The first bar at or past `after` to trade through the whole band, or `None`.

    Takes the band as two numbers rather than a `BarGap`, so it can be called while one is being
    built and never sees a half-made Point. `direction` picks which edge has to be reached: the far
    one, which is `bottom` for a gap up and `top` for a gap down.
    """
    for at in range(after, len(bars)):
        bar = bars[at]
        if bar.low <= bottom if direction == "bullish" else bar.high >= top:
            return bar

    return None


def bar_gaps(bars: Sequence[Candle]) -> list[BarGap]:
    """Every three-bar gap in `bars`, anchored on the first bar of each triple, in bar order.

    Takes a plain sequence rather than a Series, for the reason `extreme_points` gives: a gap is
    fully determined by the three bars it is read from, and asking for the global history would
    advertise a dependency that does not exist.

    Empty for fewer than `SPAN` bars — there is no triple to read, which is not the same as a
    window that held triples and none of them gapped, though both come back as an empty Series.

    Each gap is then scanned forward for the bar that closed it, over the bars *this sequence*
    holds and no others: that is the whole of what "open" means here.
    """
    found = []

    for at in range(len(bars) - SPAN + 1):
        first, third = bars[at], bars[at + SPAN - 1]

        # Annotated rather than inferred: the branches below assign string literals, which widen to
        # `str` and would not satisfy `Direction` at either call site under a type checker.
        direction: Direction

        if first.high < third.low:
            bottom, top, direction = first.high, third.low, "bullish"
        elif first.low > third.high:
            bottom, top, direction = third.high, first.low, "bearish"
        else:
            continue

        found.append(
            BarGap.anchored(
                first,
                bottom=bottom,
                top=top,
                direction=direction,
                # `at + SPAN` is the bar after the triple. See the docstring: bar 3 sits on the
                # near edge and can never reach the far one.
                closed_by=_closed_by(bars, at + SPAN, bottom, top, direction),
            )
        )

    return found


class BarGapPattern(Pattern):
    """`bar_gaps`, run over the Candles of `emits`.

    **No sources and no dials.** Unlike every other Pattern in this package it takes no `source`
    and no `pivots`: a gap is a property of three adjacent bars, not of a leg somebody cut. That
    also means it has no ordering constraint in the pipeline — it reads `ctx[BARS]`, which the
    engine fills before any Pattern runs, so it can be declared anywhere in the list.

    Output is **sparse**: one Point per gap, none for the bars between them.
    """

    def __init__(self, *, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)

    def run(self, ctx: Ctx) -> BaseSeries[BarGap]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), bar_gaps(bars.points)
        )
