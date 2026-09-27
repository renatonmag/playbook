"""The linearly weighted moving average of the closes — the browser's indicator, brought inside.

`apps/web/app/utils/indicator.ts` opens with an argument against this file existing, and it is a
good argument that this file does not contradict:

> An indicator is arithmetic over the bars the browser already holds, recomputed on every tick, and
> the only correct place for it is the browser: sending the same closes back to the API to have
> them averaged would buy nothing and cost the round trip that makes "on tick" impossible.

Every word of that stays true of an average that is **drawn**. What it does not cover is an average
a *Pattern asks questions of*. `average_relations` asks a moving average the four questions
`line_relations` asks of a pinned level — touch, close, breakout, seam — and those cannot be asked
in the browser: the near-miss reach is a fraction of the zigzag leg the bar sits in, sliced in the
engine, and the answer has to sit in `ctx` beside `legs` where a relations Pattern can read it. So
this is not the drawn line sent back to be averaged. The closes were already here; nothing crosses
the wire that did not before; and the line on the chart is still computed in the browser on every
tick, by the function quoted above, which is untouched.

What that buys is one thing and costs another, and the cost is the sharp one: **there are now two
implementations of one average, in two languages, and nothing in the build makes them agree.** They
are written to be readable against each other — this is a statement-for-statement transcription of
`weightedAverage`, in its order, with its variable names — and that is the whole of the enforcement.
It is the third instance of the cost `shape.py` and `rule.ts` already document, arrived at from a
new direction.

The rules, and what each deliberately does not do:

- **Off the close**, weighted `Σ k·close / (N(N+1)/2)`, the newest close of the window weighted `N`
  and the oldest weighted `1`. Not the typical price: "média móvel ponderada" means the closes on
  every chart this is read beside, and a mean of the four prices would be a different indicator
  wearing the same label.

- **Two flavours, one function.** `seconds` is the length of one bucket and omitting it means one
  bucket per bar. Given `3600` on a five-minute window the closes averaged are hourly closes while
  a value still lands on every five-minute bar — a staircase that steps at the top of each hour.
  Buckets are `floor(time / seconds)`, which is not a guess: it is the cut the stored `1h` rows were
  made with, so an hour aggregated here has the close the API would have given for it. With
  `seconds` equal to the emitting Timeframe's own length every bucket holds one bar and this is
  provably the first case again, which is why there is one function here and not two.

- **Closes only, and that is what removes the hard case.** The oldest bucket of a window is usually
  joined halfway through — a loaded window starts mid-session — and a bucket cut off at its *left*
  edge still has the right close, because its close is its last bar's close. Its open, high and low
  would be wrong, which is exactly why nothing here builds a bucket into a `Candle`.

- **No look-ahead.** The value on a bar is the closed buckets behind it plus the bucket in
  progress *truncated at that bar*, never that bucket's eventual close. A line that used each
  hour's final close from its first minute would show a shape nobody could have seen at the time.
  The engine-side consequence: the value on the newest bar of an unfinished bucket moves when the
  next bar lands. `/patterns` reads closed bars only, so what repaints there is the value, not
  which bars have one.

- **Silence during warm-up, rather than a short average.** No Point until `period` buckets exist.
  A 30-bar average drawn out of three bars moves like nothing the setting describes and looks
  exactly like the real thing. Leaving those bars empty says what is true. Aggregating makes it
  bite: thirty hourly buckets is roughly three of the nine sessions a default 1000-bar `5m` window
  holds, so a bucketed Series answers about the last two thirds of the window and nothing before
  it, and a period much above fifty answers nothing at all.

What it costs, stated rather than hidden:

- **Unrounded, unlike every other price this package derives.** `trend_relations.price_at` rounds
  through `integer`/`SCALE` because `breaks_out` is strict on the close and a raw interpolation
  lands on `114728.99999999999`. The same dirt is here and the same remedy would be wrong: `TICK`
  is 5.0, and quantising an average onto the five-point grid would move this line up to 2.5 points
  away from the one the browser draws — turning a comparison that is supposed to check the port
  into a systematic disagreement, and manufacturing exact ties with closes, which sit on that same
  grid. So the arithmetic is left as the browser's, bit for bit, and the price is that a close
  sitting exactly on the average may read as a breakout or not depending on the last bit of a
  float. That is a real edge and it is chosen: the two implementations agreeing matters more.

- **`bar.time` is assumed timezone-aware.** This is the first place in the engine that turns a
  `time` into a number, and `.timestamp()` on a naive datetime is read against the process's local
  zone — which would move the bucket cut with the machine. `store.candles.as_series` keeps the
  column aware and every fixture builds `tzinfo=UTC`; stated rather than asserted, as this package
  states every other assumption about its input.

- **Dense output.** One Point per bar past the warm-up — around 970 on the default window, the
  longest thing in the pipeline after `trend-lines` — and every one of them crosses the wire,
  because the serialisation is deliberately total. `O(bars)`, one pass, two rolling sums; the
  quadratic spelling was not an option in the browser and is not needed here either.

- **The producer key names the period, unlike its neighbours.** `PinnedLines.__str__` and
  `ProximityRule.__str__` pin their keys to a constant on purpose. Here `period` and `bucket` must
  render into the key, or two instances of one class collide in `ctx` and silently overwrite each
  other. So the key moves when somebody edits a period — which is the right direction of that
  trade, because a period is code in the pipeline rather than something a request carries.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import SECONDS, Timeframe

#: The smallest period worth averaging. One bar is the close; zero and below are not periods. The
#: mirror of `MIN_PERIOD` in `apps/web/app/utils/indicator.ts`, and the same number for the same
#: reason.
MIN_PERIOD = 2


@dataclass(frozen=True, slots=True)
class WeightedAverage(Candle):
    """The average's value on one bar, anchored on that bar.

    `value` and not `price`, which is the word `Pivot` uses for a level read *off* a bar. An average
    is not read off its bar — it is a number about the bars behind it that happens to be quoted in
    the same units. `pattern.py`'s own example writes it this way (`Sma.anchored(bar, value=12.4)`),
    so the field name is the one the contract documents.

    The inherited OHLCV is the bar's, and a reader who wants to check where the close sat relative
    to the average needs nothing but this Point.
    """

    value: float


def label(period: int, bucket: Timeframe | None) -> str:
    """What this average is called: `wma-30`, or `wma-30-1h` when it is bucketed.

    Short and mechanical rather than prose, because two things read it. It is the Pattern's `name`,
    which the monitor's sidebar shows — and `indicatorLabel` in the browser already argues that for
    an average "the period *is* the name", so this is the spelling the chip beside it uses. And it
    is the `line` field of every `LineRelation` `average_relations` emits, where it has to survive
    being read as an id in a table column.

    The bucket joins only when there is one. A suffix naming the emitting Timeframe would be naming
    the chart rather than the line, which is the trade `indicatorLabel` makes in the same words.
    """
    return f"wma-{period}" if bucket is None else f"wma-{period}-{bucket}"


def weighted_average(
    bars: Sequence[Candle], period: int, seconds: int | None = None
) -> list[WeightedAverage]:
    """The weighted average of `bars`' closes, one Point per bar from the `period`-th bucket on.

    The transcription of `weightedAverage` in `apps/web/app/utils/indicator.ts`, statement for
    statement and in its order — see the module docstring for why there are two of these and what
    that costs. Read the two side by side when changing either.

    `seconds` is the length of one bucket; omitted, every bucket holds one bar.

    One pass over two rolling sums across the last `period - 1` *closed* buckets: `weighted` is
    `Σ k·close` over them and `total` is `Σ close`. A bucket closing drops the departing close out
    of every weight at once, which is what `span * latest - total` does against the *old* `total`,
    and the ordering of those two lines is the whole of the arithmetic. The bar being read is added
    at weight `period` and never stored, so the next bar of the same bucket replaces it — which is
    the no-look-ahead rule, expressed rather than enforced.

    Total in the sense `weightedAverage` is: a period below `MIN_PERIOD` or a window shorter than
    one gives an empty list rather than a raise. The one guard that does *not* survive the port is
    the browser's `Number.isInteger` — there the period comes from a number input somebody is in
    the middle of typing, and here it is a pipeline parameter typed `int`. That difference is the
    whole difference between the two call sites.
    """
    if period < MIN_PERIOD or len(bars) < period:
        return []

    divisor = period * (period + 1) / 2
    #: How many *closed* buckets the window holds. The bar being read is the `period`-th.
    span = period - 1

    closed: list[float] = []
    weighted = 0.0
    total = 0.0

    #: The bucket the previous bar fell in, and its close — which becomes that bucket's close.
    bucket: int | None = None
    latest = 0.0

    line: list[WeightedAverage] = []

    for bar in bars:
        stamp = int(bar.time.timestamp())
        current = stamp if seconds is None else stamp // seconds * seconds

        # A bar in a new bucket is the proof the previous one closed — no clock is consulted, the
        # same rule `/patterns` reads a closed bar by.
        if bucket is not None and current != bucket:
            if len(closed) >= span:
                leaving = closed[len(closed) - span]
                weighted += span * latest - total
                total += latest - leaving
            else:
                # Still filling: nothing leaves, and the arrival takes the next weight up.
                weighted += (len(closed) + 1) * latest
                total += latest
            closed.append(latest)

        bucket = current
        latest = bar.close

        if len(closed) >= span:
            line.append(
                WeightedAverage.anchored(bar, value=(weighted + period * bar.close) / divisor)
            )

    return line


class WeightedAveragePattern(Pattern):
    """`weighted_average` over the Candles of `emits`, at the period it was constructed with.

    **No source, and so no ordering constraint.** It reads `ctx[BARS]` and nothing else, like
    `BarGapPattern`, and may be declared anywhere a pipeline likes — the constraint is downstream,
    on whatever reads this Series.

    **`bucket` is a Timeframe, not a count of seconds**, so a pipeline says `bucket="1h"` and the
    conversion happens in one place. Coarser than `emits` is the case worth having; equal to it is
    the plain average, which the module docstring shows is the same function answering the same
    numbers. Finer is not refused here and would be meaningless — the bars cannot be subdivided —
    and refusing it would be validation this package does nowhere else.

    **Two of these in one pipeline is the ordinary case**, the short average read against the long
    one, which is why `name` is set per instance rather than as a class attribute — the trade
    `LegPattern` already makes, for the same collision. It is also why the period has to render
    into `producer`; see the module docstring.

    Output is **dense** and starts late: one Point per bar from the `period`-th bucket onward, and
    a window too short for the period gives an empty Series rather than a missing key.
    """

    def __init__(
        self,
        *,
        period: int,
        bucket: Timeframe | None = None,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.period = period
        self.bucket = bucket
        self.name = label(period, bucket)

    def run(self, ctx: Ctx) -> BaseSeries[WeightedAverage]:
        bars = ctx[BARS][self.emits]
        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            weighted_average(
                bars.points,
                self.period,
                None if self.bucket is None else SECONDS[self.bucket],
            ),
        )
