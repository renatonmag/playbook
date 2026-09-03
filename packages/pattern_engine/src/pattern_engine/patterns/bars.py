"""The same three reversal filters, asked of every bar in the history rather than of a leg.

`LegReversalsPattern` answers "which bars *of this leg* are candidates for the turn". Two of the
things it does have nothing to do with the filters and everything to do with the leg: only bars
inside a `LegWindow` are ever looked at, and each leg is filtered for the single direction it is a
candidate for — the opposite of its own move.

Neither is a property of the arithmetic. `reverses`, `nests` and `marks` are claims about bars,
and this Pattern puts them to every bar, for **both** turns. What comes out is a flat Series of
marks: one Point per finding, anchored on the bar it is about. With no window to index into there
is nothing for a `LegBar.at` to mean, so the two-level shape of `LegReversals` — a leg holding a
`found` list — buys nothing here and is not repeated.

**The direction on a mark is the turn it is a candidate for, and nothing else.** This is the one
place a reader coming from `LegReversals` will trip: that Point's `direction` is the *leg's own
move*, deliberately the opposite of what its marks hunt. There is no leg here, so there is no
inversion to keep straight — a `bearish` mark is a candidate top, full stop.

Which means each filter answers the direction question its own way:

- **`two-bar`** carries the colour its *closing* bar agrees with, so exactly one direction can
  hold per bar. See `run`.
- **`reversal-bar`** carries whichever side(s) of the Forma rule the Shape matched, and both is a
  real answer: with `require_wf_over_wc` off, a symmetric bar inside the body bounds matches bull
  and bear alike. Two marks is the truthful reading, and it is a difference from the leg version,
  where the leg had already picked a side.
- **`inside-bar`** carries `None`. It reads `high` and `low` and no body at all, so it makes no
  claim about a direction and is not going to be given one. Anything filtering by direction has
  to decide what to do with these; the monitor keeps them whatever the checkboxes say.

What it costs, stated rather than hidden:

- **Many times more marks than `leg-reversals`**, because no leg is filtering the history down
  first and both directions are asked. That is the whole point of the Pattern, and it is also why
  it is a separate Series rather than a looser setting on the other one.
- **No leg-overlap duplication**, which is the one thing it does *not* inherit: consecutive
  `LegWindow`s share `ahead + 1` bars and list them twice. Here every bar is visited once.
- Bars carrying nothing emit nothing, so a gap in the Series is "no filter marked these", not
  "these were not looked at" — the history is walked whole.

The producer key reads `bars(rule=K,k=1.0,...)`. It cannot collide with `engine.BARS`, the key
the Candles themselves live under: that one is the bare string `bars`, and a producer key always
carries its `(params)`.
"""

from dataclasses import dataclass

from ..candles import Candle
from ..engine import BARS, INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction, FormaRule, marks, shape_of
from ..timeframes import Timeframe
from .reversal_filters import MarkType, nests, reverses

#: Both turns, in the order the marks are emitted in. A tuple rather than the two names written
#: out at each of the two loops that walk them, so the emitted order is stated once.
BOTH: tuple[Direction, ...] = ("bullish", "bearish")


@dataclass(frozen=True, slots=True)
class BarMark(Candle):
    """One finding about one bar: which filter marked it, and for which turn.

    A Series Point in its own right, unlike `LegBar` — `time` here *is* the anchor, because the
    bar is the whole of what the Point is about. It carries no index into anything and needs no
    companion Point to be read.

    A bar can produce several of these: the three filters are a union, not a composition, and the
    Forma rule can match a Shape for both turns at once. They share an anchor, which `BaseSeries`
    allows — it orders by `time` and does not require it to be unique. So nothing downstream may
    key a mark on `time` alone; `time`, `type` and `direction` together name one.
    """

    type: MarkType
    #: The turn this mark is a candidate for — **not** a leg's move, which is the inversion
    #: `LegReversals.direction` carries. `None` for `inside-bar`, which has no body to have a
    #: colour and so makes no directional claim at all.
    direction: Direction | None


class BarsPattern(Pattern):
    """The three reversal filters over the whole history, in both directions.

    No sources. It reads `ctx["bars"][emits]` and nothing else, which is what removing the leg
    bought: `LegReversalsPattern` needs two Patterns declared ahead of it — the windows, and the
    pivots that say which extreme each window closes on — and can fail because they disagree.
    This one has no ordering constraint at all and can sit anywhere in the pipeline.

    `k`, `similarity` and `expansion` stay constructor parameters rather than module constants for
    the reason the pipeline states: they are the dials someone tuning the detector comes looking
    for. `rule` is the one the browser can edit — see `routers/patterns.py`.
    """

    name = "Bars"

    def __init__(
        self,
        *,
        rule: FormaRule,
        k: float,
        similarity: float,
        expansion: float,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.rule = rule
        self.k = k
        self.similarity = similarity
        self.expansion = expansion

    def run(self, ctx: Ctx) -> BaseSeries[BarMark]:
        """One Point per finding, in bar order, grouped by the bar they are about.

        The per-bar emission order is fixed — inside bar, then the pair, then the rule, each of
        the last two in `BOTH` — so the Series is sorted by `time` without a sort, and a bar's
        marks arrive together. Anything reading them in pairs relies on that grouping.
        """
        bars: BaseSeries[Candle] = ctx[BARS][self.emits]

        history = bars.points
        # Measured once for the pass, like `LegReversalsPattern` does: `reverses` reads the Shape
        # of both bars of a pair, so every bar's Shape is asked for at least twice.
        shapes = [shape_of(bar) for bar in history]

        points: list[BarMark] = []
        for i, bar in enumerate(history):
            # Above the shape guard on purpose, and for the reason `marked_bars` gives:
            # containment is read off `high` and `low`, so unlike the two below it has something
            # to say about a bar that traded at a single price.
            if nests(history, i, self.emits):
                points.append(BarMark.anchored(bar, type="inside-bar", direction=None))

            shape = shapes[i]
            if shape is None:
                # No amplitude, so no proportions: neither shape-reading filter has anything to
                # read. Skipped in silence — a real bar, not an error.
                continue

            for direction in BOTH:
                # A bar is a `two-bar` when it belongs to any matching pair, with the bar before
                # it or the one after. At most one direction can hold: a pair must *close* on the
                # colour of its reversal, and the pair's two bars differ in colour, so a bar that
                # closes one pair opens the next as the wrong colour. The loop cannot double up,
                # and that is arithmetic rather than luck.
                if reverses(
                    history, shapes, i - 1, direction,
                    self.k, self.similarity, self.expansion, self.emits,
                ) or reverses(
                    history, shapes, i, direction,
                    self.k, self.similarity, self.expansion, self.emits,
                ):
                    points.append(BarMark.anchored(bar, type="two-bar", direction=direction))

            for direction in BOTH:
                # This one *can* hold for both, and two marks is then the answer: `Shape.facing`
                # swaps the two shadows, so a bar with `wf ≈ wc` inside the body bounds satisfies
                # the rule read either way. Only `require_wf_over_wc` rules it out, by demanding a
                # strict inequality that cannot hold in both directions at once.
                if marks(self.rule, shape, direction):
                    points.append(BarMark.anchored(bar, type="reversal-bar", direction=direction))

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
