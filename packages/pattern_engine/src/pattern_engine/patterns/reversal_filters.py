"""The reversal filters themselves — the arithmetic, with no leg and no Series in sight.

Four claims a bar can carry, extracted here because two Patterns now ask them different
questions: `LegReversalsPattern` asks them of the bars of one leg, filtered for the one turn that
leg is a candidate for, and `BarsPattern` asks them of every bar in the history, for both turns.
The rules are identical in the two — they are statements about *bars* — and leaving them in
`leg_reversals` would have made the leg-agnostic Pattern import the leg one to borrow arithmetic
that was never about legs.

The fourth is asked by `BarsPattern` alone. It lives here anyway, because what this module is is
the one place bar arithmetic is written — not "the filters `leg_reversals` happens to need".

- **The two-bar reversal** — `reverses`. Two adjacent Candles, each with a body dominating its own
  shadows, in opposite colours, of comparable size, and large for the moment they happened in.
  Ported from `apps/web/app/utils/two-bar-reversal.ts`.
- **The Forma rule** — not here: it is `marks` in `shape.py`, which needs no history at all.
- **The inside bar** — `nests`. One Candle whose range its predecessor already covered, both
  extremes included.
- **The small overlap** — `clears`. One Candle that closed clear of its predecessor's range: a bull
  bar above the previous high, a bear bar below the previous low. Not a reversal filter at all —
  it marks a bar that *continued*, not one that might turn — which is why only `BarsPattern`, whose
  business is every reading of every bar, asks it.

**Everything reads the global history, never a slice.** Every function that needs context takes
the whole bar array and an index rather than the Candles it will look at, because `expands`
averages the ten Candles *before* a pair and a pair can straddle the first bar of whatever window
a caller has in mind. Measuring inside a slice would judge its opening bars against a truncated
average — a different verdict from the bench, for no reason but the slicing. The caller decides
*which* bars get asked about; it does not get to decide what the answer is measured against.

`shape_of` returns `None` for a Candle with no amplitude, and the two shape-reading filters have
nothing to read on one. `nests` does: it reads `high` and `low`, and a bar that traded at one
price sits inside whatever preceded it, truthfully. Callers must keep that ordering — see
`marked_bars` and `BarsPattern.run`, which both mark the inside bar above the shape guard.

The arithmetic here exists twice, once in TypeScript, with nothing comparing them. The defence is
`/verify` next to `/two-bar-reversal`, read by a person.
"""

from collections.abc import Sequence
from typing import Literal

from ..candles import Candle
from ..shape import Direction, Shape
from ..timeframes import SECONDS, Timeframe

#: How far the body must beat the larger shadow. `1` is "at least as large as", which on its own
#: pins the body above `k / (k + 2)` — a third.
DEFAULT_K = 1.0

#: How alike the two bodies must be in size, as `min / max`. On by default, unlike `k`'s neutral
#: `1`: a big shove one way answered by a token nudge back is not a reversal, however clean each
#: bar looks alone.
DEFAULT_SIMILARITY = 0.65

#: How many times the recent average amplitude the larger of the two bars must reach. Without it
#: the rule marks the whole of a quiet range, where every bar is a clean little body and the
#: alternation is just noise taking turns.
DEFAULT_EXPANSION = 0.9

#: How many preceding Candles the amplitude average is taken over. A constant rather than a dial:
#: what the number buys is a sense of "recently", and moving it between 8 and 15 barely moves the
#: counts, so a control for it would look meaningful and not be.
AVERAGE_WINDOW = 10

#: Which filter marked a bar. Names rather than a flag, because they are different claims about
#: different shapes — see the module docstring on which of them can hold at once.
MarkType = Literal["two-bar", "reversal-bar", "inside-bar"]


def amplitude(candle: Candle) -> float:
    """`H - L` — how much ground the bar covered."""
    return candle.high - candle.low


def body_points(candle: Candle) -> float:
    """The body in the Instrument's own points — the price actually travelled, open to close.

    The one place size enters. Everything else read here is scale-free, and has to stay that way:
    `Shape.body` is a fraction of its *own* bar, so two bodies of 0.6 are equally dominant and may
    be 500 points and 40 points.
    """
    return abs(candle.close - candle.open)


def dominates(shape: Shape, k: float) -> bool:
    """Whether the body beats the larger of the two shadows.

    `>=` rather than `>`, which is not free: about 2% of the Candles in the `5m` history sit
    exactly on the line at `k = 1`, and each pair reads two of them.
    """
    return shape.body >= k * max(shape.upper, shape.lower)


def implied_body_min(k: float) -> float:
    """The floor on the body a given `k` enforces on its own — `k / (k + 2)`.

    With `upper + lower + body == 1` the larger shadow is at least `(1 - body) / 2`, so
    `dominates` already bounds the body from below. Stated so nobody adds a floor the dial
    guarantees.
    """
    return k / (k + 2)


def alike(a: Candle, b: Candle, similarity: float) -> bool:
    """Whether the two bodies are close enough in size — `min / max >= similarity`.

    The only test here that compares the two Candles *to each other*: `dominates` asks each bar
    about its own shadows and cannot see across the pair. Takes Candles rather than Shapes because
    it is the one comparison that needs the size back.
    """
    first, second = body_points(a), body_points(b)
    larger = max(first, second)
    if larger <= 0:
        return True
    return min(first, second) / larger >= similarity


def adjacent(a: Candle, b: Candle, timeframe: Timeframe) -> bool:
    """Whether `b` is the Candle that immediately follows `a` — in time, not in an array.

    Two claims, both required. The interval must be exactly one bar, and the two must fall on the
    same day. Reads `time` as UTC, which is what `Candle` declares it to be: the session boundary
    has to be the same one wherever this runs, or the counts would depend on a timezone.

    The same-day test is redundant against today's data, where every non-contiguous step is
    already a session boundary. It is here for the data that does not exist yet — an after-market
    session crossing midnight, or a Candle missing from the middle of a session.
    """
    if (b.time - a.time).total_seconds() != SECONDS[timeframe]:
        return False
    return a.time.date() == b.time.date()


def average_amplitude(bars: Sequence[Candle], i: int, timeframe: Timeframe) -> float | None:
    """The mean amplitude of the Candles immediately before `bars[i]`, or `None` when there are
    none to average.

    Walks backwards through `adjacent`, so the window stops at a session boundary rather than
    averaging yesterday's afternoon into this morning's first bars. A short window is used as-is
    rather than rejected: that would throw away the opening of every session in the history, and
    a mean of four bars is still an answer to "was this big for the moment", just a noisier one.
    """
    total = 0.0
    seen = 0

    j = i - 1
    while j >= 0 and seen < AVERAGE_WINDOW:
        if not adjacent(bars[j], bars[j + 1], timeframe):
            break
        total += amplitude(bars[j])
        seen += 1
        j -= 1

    return None if seen == 0 else total / seen


def expands(bars: Sequence[Candle], i: int, factor: float, timeframe: Timeframe) -> bool:
    """Whether the pair at `i` is large for where it happened — `max(amplitude) >= factor * mean`.

    **At least one** of the two bars, not both: a reversal is often one ordinary bar answered by
    an outsized one, and demanding it of both asks for two exceptional bars in a row, which is a
    rarer and different thing.

    Amplitude rather than body: this asks how much ground the bar covered, and a long rejection
    wick is ground covered. The body is `similarity`'s business, and the two dials stay on
    separate measurements so tightening one does not quietly do the other's job.

    Passes when there is nothing to compare against. A comparison with no second term cannot
    reject.
    """
    if factor <= 0:
        return True

    average = average_amplitude(bars, i, timeframe)
    if average is None or average <= 0:
        return True

    return max(amplitude(bars[i]), amplitude(bars[i + 1])) >= factor * average


def reverses(
    bars: Sequence[Candle],
    shapes: Sequence[Shape | None],
    i: int,
    direction: Direction,
    k: float,
    similarity: float,
    expansion: float,
    timeframe: Timeframe,
) -> bool:
    """Whether the pair `(i, i + 1)` is a reversal in `direction`.

    Takes the whole array and an index rather than the two Candles, because `expands` reads the
    bars *before* the pair and a pair alone cannot answer it. Out-of-range and shapeless Candles
    are answered `False` here rather than guarded at every call site.

    The direction test is on the **closing** bar of the pair: a bullish reversal is a fall
    answered by a green bar, whatever colour opened it. It is what makes one pair belong to one
    leg — without it every pair would be marked in both directions.
    """
    if i < 0 or i + 1 >= len(bars):
        return False

    first, second = shapes[i], shapes[i + 1]
    if first is None or second is None:
        return False

    if not adjacent(bars[i], bars[i + 1], timeframe):
        return False
    if first.bear == second.bear:
        return False
    if not second.agrees(direction):
        return False

    return (
        dominates(first, k)
        and dominates(second, k)
        and alike(bars[i], bars[i + 1], similarity)
        and expands(bars, i, expansion, timeframe)
    )


def nests(bars: Sequence[Candle], i: int, timeframe: Timeframe) -> bool:
    """Whether `bars[i]` is an inside bar — its range contained by the bar before it.

    Reads `high` and `low` and nothing else. That is what makes this filter unlike the other two:
    it has no body term, so it makes no claim about colour, and the leg's direction has nothing to
    say about it. A bar either sits inside its predecessor or it does not, in a rise as in a fall.

    The comparisons are **not** strict, so a bar sharing one or both extremes with its mother still
    counts. This is the opposite convention to `SimpleLegPattern._engulfs`, which demands a strict
    break of both extremes for the inverse relation — deliberately, not by oversight: an equal high
    is a high that was not exceeded, which is containment, and it is a break of nothing.

    Takes the array and an index rather than two Candles, matching `reverses`, because the pair has
    to be found in the history to be checked for adjacency at all.
    """
    if i <= 0:
        return False

    previous, current = bars[i - 1], bars[i]

    # Yesterday's last bar is not "the bar before" this one in any sense that makes containment
    # mean something. Same guard the pair filter and the amplitude average use.
    if not adjacent(previous, current, timeframe):
        return False

    return previous.high >= current.high and previous.low <= current.low


def clears(bars: Sequence[Candle], i: int, direction: Direction, timeframe: Timeframe) -> bool:
    """Whether `bars[i]` closed clear of the range of the bar before it — a small overlap.

    A bull bar that closed above the previous high, or a bear bar that closed below the previous
    low. Two claims per direction, and the colour one is not redundant: a bar can open above the
    previous high, sell off, and still close above it while being bear all the way down. That bar
    overlapped little with its predecessor, but it is not a bull bar and the rule says bull bar.

    So a bar with no body — `close == open` — is neither colour and is never marked, which is the
    one thing this does *not* share with `nests`: containment survives a bar that traded at a
    single price, a colour does not.

    The comparisons are strict, the opposite convention to `nests` and for the same reason read the
    other way: there, an equal high is a high that was not exceeded, so containment holds. Here the
    claim *is* that the close exceeded it, and a close sitting exactly on the previous high has
    exceeded nothing.

    Reads `open`, `close` and one extreme of the previous bar, so — like `nests` and unlike the two
    shape-reading filters — it has an answer for a bar `shape_of` returns `None` for, and callers
    have to ask it above their shape guard. See `BarsPattern.run`.

    Takes the array and an index rather than two Candles, matching `nests` and `reverses`: the pair
    has to be found in the history to be checked for adjacency at all.
    """
    if i <= 0:
        return False

    previous, current = bars[i - 1], bars[i]

    # Yesterday's last bar is not "the bar before" this one. Without this the overnight gap would
    # mark a good share of the session's first bars, which says nothing about overlap.
    if not adjacent(previous, current, timeframe):
        return False

    if direction == "bullish":
        return current.close > current.open and current.close > previous.high
    return current.close < current.open and current.close < previous.low
