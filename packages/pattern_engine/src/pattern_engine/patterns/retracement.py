"""How far a leg came back — the move it retraced, and what fraction of it.

Every Pattern below the detectors answers about one leg: where it turned, how far it reached,
what it held. This answers the question a reader asks the moment two legs are on screen together,
and which nothing here has answered before: **how much of the move before it did this leg give
back?** That fraction is what tells a pullback from a reversal.

A leg is a **consecutive pair of pivots**, so this reads a detector's pivot Series and never the
Candles. Nothing here looks *inside* a leg — a retracement is four prices — which is why there is
no `Leg` or `LegWindow` source and no `bar_positions` call. `general_direction.py` is the
precedent for a Pattern that reads pivots alone.

One sentence of vocabulary, because the rest is unreadable without it and every reader derives it
backwards once: **the direction of a leg and the direction of the move it retraces are
opposite.** The leg closing at a *high* is a rise, and what it gives back is the *fall* before it.
So "the bear move" names the thing being measured against, never the thing being measured.

The rule, for a leg closing at a high; the low side is the vertical mirror throughout:

- **The origin** is the nearest earlier *high* pivot that price has not exceeded — `>=` against
  the closing price, not `>`. Not tidiness: under `>` a leg reaching 99.99% of the previous one
  reports ≈1.0 and a leg reaching *exactly* 100% skips past that top to an older, larger origin
  and reports something like 0.4. An exact retest is the most meaningful reading on a chart, and
  `>` is the one rule that hides it.
- **The turn** is the deepest *low* pivot strictly between the origin and the close, and at or
  below the close. Ties keep the earliest, the rule `leg_extremes.py` states and for the same
  reading: when the level was achieved.
- **The fraction** is `(close − turn) / (origin − turn)`.

Three things worth stating plainly, because they are what the rule buys:

- **The short-leg case is not a second rule.** When a leg is shorter than the one before it, the
  nearest un-exceeded top *is* the top two pivots back, the only pivot between them is the bottom
  they share, and the fraction collapses to the textbook `|close − open| / |open − previous|`.
  Everything the backward walk does is what happens when that top is no longer un-exceeded. One
  rule, so the reading never jumps between two definitions of "the previous leg".
- **The fraction is in [0, 1] by construction** — a theorem, not a clamp. It needs *both* bounds:
  the origin at or beyond the close, and the turn at or beyond it the other way, so the numerator
  is a part of the denominator. Inferring the second from the alternation of the pivots would be
  wrong, for the reason below.
- **The side filters are logic, not decoration.** Neither detector guarantees alternation.
  `simple-leg` says so itself — a bar holds one mark, so two marks walking onto one bar are one
  mark, which `general_direction.py` survives per-side rather than assuming away. `zig-zag` can
  break it by a second route: `_cleanup_condition` tests `zz[last] != arr[last]`, a *price*
  comparison standing in for an identity check, so on a bar where `high == low` — dojis and
  auctions, real on B3 per `_side`'s docstring — a vertex can be judged as the wrong side and
  deleted, leaving two of one side adjacent. Hence the last rule: **a "leg" whose two ends are on
  one side is not a leg**, and it is measured as nothing rather than as a fraction taken between
  two tops.

What it deliberately does not do, and what that costs:

- **It never reports an extension.** No reading above 100% is reachable here, by construction —
  by the time one would exist the denominator has already grown. A trader who says "this leg ran
  127% of the last one" will not find that number. The cost is a **discontinuity that reads as a
  bug**: a leg creeping up through the previous top reports 0.97, then 0.99, then one tick higher
  and the reading drops to 0.4 against a swing three legs deep. That is the rule working, and
  `retraced_legs` on the payload is the only thing that makes it legible. Anything drawing this
  number and not that one is asking its reader to take the jump on faith.
- **It does not snap to Fibonacci.** 0.618 arrives as 0.618, not as "the 61.8 level". Which
  ladder somebody reads it against is theirs; rounding to the nearest rung would be a second
  opinion about which ladder exists.
- **The window is the only lookback bound.** There is no `lookback` dial: a leg with nothing
  un-exceeded anywhere in the loaded bars is simply not measured. So `measured is None` means
  *"not measured in this window"* and never "unmeasurable" — the same honesty `bar_gap.py` keeps
  about an unclosed gap, and the same trap: the identical leg reads `None` on a short window and
  0.45 on a longer one. Every older leg's reading can therefore change when the window grows, and
  nothing on the Point says so — `provisional` covers the newest leg and not this.
- **The turn is a *pivot*, and a pivot is only as good as what it was read off.** Nothing here
  looks at a bar, so every price in the answer is one the source handed over — and a detector's
  own vertex is not its leg's extreme. `simple-leg` says so outright: its price is the *marked
  bar's* extreme, and that bar can sit several bars past where the leg actually turned. The
  zigzag is closer and still not exact. Read off either detector directly, the denominator
  understates the move and the fraction is wrong by whatever was left on the table.

  **So this Pattern's fidelity is whatever it is pointed at**, and that is a decision for the
  pipeline rather than for this module. `leg-reach` exists to make it: it reprices a detector's
  pivots at the extremes their legs really reached, one Point per pivot in the same order, so it
  drops in as a `source` with nothing here changing. Pointed at one, the fractions match a ruler
  dragged across the same swing. Pointed at a raw detector, they do not — and nothing on the
  Point says which it was, only the producer key does.
- **Unmeasurable legs are still Points**, so `len(this) == len(source) - 1` always holds and "no
  origin in this window" stays distinguishable from "no leg here". This Series is dense in its
  legs, unlike most here, and a caller filtering for the ones with a number to show has to say so.
- **The last leg is flagged, not dropped**, unlike `leg-extremes`. That Pattern drops its last leg
  because the leg's *window* is malformed — it swallows every remaining bar as tail. A Pattern
  that reads no bars has no such problem: the final leg is two well-formed prices that are merely
  unsettled, and the pullback running right now is the number most worth having. `provisional` is
  the filter for anyone who disagrees.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from ..candles import Pivot
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_reach import SidedPivot
from .simple_leg import integer

#: How two scaled prices compare. Named only so `_BEYOND` below reads as a table of rules
#: rather than as a type signature.
type Cmp = Callable[[int, int], bool]

#: How a price on each side compares with a reference, at-or-beyond and strictly beyond.
#:
#: A table rather than branches in the two searches below, so the low side is visibly the vertical
#: mirror of the high one and cannot drift from it — the form `general_direction._WATCH` uses.
#: Both searches read it, which is what keeps the origin's bound and the turn's bound from being
#: written as two unrelated rules: they are one rule, read on opposite sides.
#:
#: The pairs are read as: for a *high*, at-or-beyond means at least as high. The strict member is
#: the tie rule — a later pivot equalling the deepest does not displace it.
#: The pair per side is `(at_or_beyond, strictly_beyond)`.
_BEYOND: dict[Literal["high", "low"], tuple[Cmp, Cmp]] = {
    "high": (
        lambda candidate, reference: candidate >= reference,
        lambda candidate, reference: candidate > reference,
    ),
    "low": (
        lambda candidate, reference: candidate <= reference,
        lambda candidate, reference: candidate < reference,
    ),
}

#: The side a leg opens on, given the side it closes on. The turn is looked for on this side.
_OPPOSITE: dict[Literal["high", "low"], Literal["high", "low"]] = {"high": "low", "low": "high"}


@dataclass(frozen=True, slots=True)
class RetracedMove:
    """The move a leg came back into, and how far back into it the leg came.

    **Whole or absent.** There is no state in which some of these are known and others are not,
    which is the whole reason this nests inside a Point rather than spreading six optional fields
    across it: a caller cannot read a `move` with no `origin`, and there is one guard at a call
    site instead of six the type system cannot know are correlated. The case that looked like
    partial knowledge — an origin and a turn at one price — is settled as no measurement at all,
    because a move of no size is not a move that was retraced.

    Not a Point and not a `Candle` subclass, unlike `LegPoint` and `LineEnd`: it is anchored on
    nothing and has no bar of its own. What it carries *are* two Points, so a reader has the times
    and can find the move on the chart without joining back to the source Series.
    """

    #: Where the retraced move began: the nearest earlier pivot on the closing side that price has
    #: not exceeded. Normalised to a bare `Pivot`, so the two detectors produce one wire shape and
    #: nothing downstream branches on which one it came from — `since` and `provisional` are facts
    #: about a source's own Series, not about this measurement.
    origin: Pivot
    #: Where the retraced move ended and the measured one began: the deepest opposite-side pivot
    #: between `origin` and the close. The 0% end of the ladder, `origin` being the 100% end.
    turn: Pivot
    #: `|origin.price - turn.price|` — the whole move, in price units. Carried rather than left to
    #: be re-derived, so a row can be checked without resolving the two Points.
    retraced: float
    #: `|close.price - turn.price|` — how far back the leg came.
    move: float
    #: `move / retraced`, in **[0, 1]** by construction — see the module docstring for why that is
    #: a theorem and not a clamp. A fraction and not a percentage: the engine measures, the browser
    #: formats.
    ratio: float
    #: How many pivots each half of the move spans. `(1, 1)` is the textbook reading — this leg
    #: against the one before it — and anything larger says the backward search walked past a top
    #: the leg had taken out. That is the one fact the four prices cannot express, and the reason a
    #: reading can drop sharply between two adjacent legs. Pivot steps rather than legs strictly
    #: speaking, which differ only where the source emitted two same-side pivots in a row.
    retraced_legs: int
    move_legs: int


@dataclass(frozen=True, slots=True)
class Retracement(Pivot):
    """One leg and its measurement, anchored on the pivot that **closes** the leg.

    Anchored on the close rather than on the open — unlike `LegWindow` and `LegExtremes`, and the
    difference is the question. Those describe a span and anchor where it starts. This reports a
    level reached, and the bar it was reached on is the one to put a number beside.
    """

    #: Which extreme of its bar the closing pivot is, copied from the source. `"high"` is a leg
    #: that rose into a top, and the move it retraces is the fall before it.
    #:
    #: The `Pivot` vocabulary, not `shape.Direction` — deliberately unlike `LegExtremes.direction`,
    #: which is `bullish`/`bearish`. This is not a claim about the move, it is which side the
    #: source marked; translating it would be inventing a second opinion in an adapter. A screen
    #: filtering on it wants the two-sided list, not the bull/bear one.
    direction: Literal["high", "low"]
    #: The measurement, or `None`. Three causes, one absence, and they are not worth telling
    #: apart on the wire: no un-exceeded pivot anywhere in the window, a "leg" whose two ends are
    #: on one side, or an origin and a turn at one price. In all three there is no move to take a
    #: fraction of.
    measured: RetracedMove | None
    #: This leg closes on the newest pivot the source produced, so its closing price can still
    #: move — the zigzag's cleanup relocates that vertex, and `simple-leg` flags its own running
    #: mark. Read positionally, from the last leg of the source rather than from a source-specific
    #: field, so one rule serves both detectors. Conservative, and that is the cost: when
    #: `simple-leg`'s newest bar already carries a settled mark it emits no provisional Point, and
    #: this flags a genuinely closed leg. The same trade `leg-extremes` already accepts on
    #: `advancing-legs`.
    provisional: bool


def _origin(
    pivots: Sequence[SidedPivot], close: int, upto: int, side: Literal["high", "low"]
) -> int | None:
    """The index of the nearest pivot before `upto` on `side` whose price has not been exceeded.

    Backwards from `upto - 1`, so "nearest" means nearest in time and the first match wins. The
    range is empty for the first leg of a Series, which is why that case needs no guard of its own:
    there is nothing behind it, so there is no origin, so there is no measurement.

    The side test is not redundant with the price test — see the module docstring on alternation.
    """
    reaches, _ = _BEYOND[side]

    for index in reversed(range(upto)):
        candidate = pivots[index]
        if candidate.direction == side and reaches(integer(candidate.price), close):
            return index

    return None


def _turn(
    pivots: Sequence[SidedPivot],
    close: int,
    after: int,
    before: int,
    side: Literal["high", "low"],
) -> int | None:
    """The index of the deepest pivot in `(after, before)` on `side` and at or beyond `close`.

    Two bounds and not one. Being on the opposite side to the close is what makes it the end of a
    move rather than a point along one; being at or beyond the close is what makes the measured
    move a *part* of the retraced one, and so what makes the fraction land in [0, 1] whatever the
    source did. On well-formed pivots the leg's own opening vertex satisfies both, so the bounds
    cost nothing in the ordinary case and refuse to answer in the malformed one.

    The comparison is **strict**, so ties keep the earliest — `leg_extremes._best`'s rule.
    """
    at_or_beyond, deeper = _BEYOND[side]

    found: int | None = None
    best = 0

    for index in range(after + 1, before):
        candidate = pivots[index]
        if candidate.direction != side:
            continue

        value = integer(candidate.price)
        if not at_or_beyond(value, close):
            continue

        if found is None or deeper(value, best):
            found, best = index, value

    return found


def _measure(pivots: Sequence[SidedPivot], at: int) -> RetracedMove | None:
    """The measurement of the leg closing at `pivots[at]`, or `None` where there is none.

    The three refusals in order: a "leg" whose ends are on one side, no un-exceeded pivot in the
    window, and an origin and a turn at one price. Each is argued in the module docstring.
    """
    close = pivots[at]
    side = close.direction

    if pivots[at - 1].direction == side:
        return None

    level = integer(close.price)

    origin_at = _origin(pivots, level, at - 1, side)
    if origin_at is None:
        return None

    turn_at = _turn(pivots, level, origin_at, at, _OPPOSITE[side])
    if turn_at is None:
        return None

    origin, turn = pivots[origin_at], pivots[turn_at]
    if integer(origin.price) == integer(turn.price):
        return None

    retraced = abs(origin.price - turn.price)
    move = abs(close.price - turn.price)

    return RetracedMove(
        # Bare `Pivot`s: one shape from either detector — see the field's own note.
        origin=Pivot.anchored(origin, price=origin.price),
        turn=Pivot.anchored(turn, price=turn.price),
        retraced=retraced,
        move=move,
        ratio=move / retraced,
        retraced_legs=turn_at - origin_at,
        move_legs=at - turn_at,
    )


def retracements(pivots: Sequence[SidedPivot]) -> list[tuple[SidedPivot, RetracedMove | None]]:
    """Every leg of `pivots`, paired with its measurement — one entry per consecutive pair.

    Returns the **closing** pivot of each leg beside its answer, the shape `general_direction`
    returns and for the same reason: the adapter needs the Point to anchor on and the payload to
    hang on it, and the rule should not have to know that Points have identities. Takes Points
    rather than a Series, like every rule in this package.

    One entry per leg **whether or not it could be measured**, so the caller can tell "this leg has
    no origin in the window" from "there is no leg here". `pivots[0]` closes no leg and never
    appears; fewer than two pivots is no legs and so no entries.
    """
    return [(pivots[at], _measure(pivots, at)) for at in range(1, len(pivots))]


class RetracementPattern(Pattern):
    """`retracements` as a Pattern: each leg of one detector against the move it retraced.

    One source, and an **instance** rather than a producer key, for the reason `LegPattern` gives:
    a string restates what `Pattern.producer` derives, and the two fall out of step as a `KeyError`
    at run time instead of an error at import.

    No `pivots` second source, unlike `LegExtremesPattern`, and that is not an omission: a
    `LegWindow` cannot say which extreme it closed on, and a pivot names its own side. The whole of
    what this Pattern needs is in one Series.

    **One source is also the rule about what may be compared with what.** A leg of the zigzag is
    measured against zigzag legs and a simple leg against simple legs, and that holds because
    there is no path in here from one detector's pivots to the other's — not because anything
    checks. A pipeline enforces it by declaring two single-source instances and no third that
    mixes them.

    No dials at all. The window is the lookback, every comparison is settled in the module, and
    the detector's own tuning — `depth` — belongs at the pipeline site.

    Declare it after its source. There is no dependency graph, and the wrong order leaves the key
    absent from `ctx` with the reason only in the log.
    """

    def __init__(self, *, source: Pattern, reads: tuple[Timeframe, ...], emits: Timeframe) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        # An instance attribute because the pipeline runs this class twice, over the two
        # detectors — `LegExtremesPattern`'s reason and its exact form. The two Series are told
        # apart in `ctx` by `producer`, which renders the source whole, and on screen by this.
        self.name = f"Retracement · {source.name}"

    def run(self, ctx: Ctx) -> BaseSeries[Retracement]:
        """One Point per leg, anchored on the pivot that closes it and carrying that pivot's price.

        The Candles of `emits` are never read — a retracement is four prices, and all four are in
        the source. So this runs with no bars in `ctx` at all, which is the sharpest statement of
        what it depends on.

        No cross-Series anchor to resolve, so no lookup to fail: a closing pivot *is* a bar, and
        `anchored` copies it. Anchors arrive in the source's order and are therefore already
        non-decreasing, which is what `BaseSeries` requires.
        """
        pivots: BaseSeries[SidedPivot] = ctx[self.source.producer]

        answers = retracements(pivots.points)
        last = len(answers) - 1

        points = [
            Retracement.anchored(
                close,
                price=close.price,
                direction=close.direction,
                measured=measured,
                provisional=index == last,
            )
            for index, (close, measured) in enumerate(answers)
        ]

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
