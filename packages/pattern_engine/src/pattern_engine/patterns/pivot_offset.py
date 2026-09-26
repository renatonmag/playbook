"""Whether the simple legs are still lagging the zigzag at the right edge of the window.

`zig-zag` and `simple-leg` are two answers to the same question — where did this leg end — run
over one window precisely so the difference can be looked at. Everywhere else in this package that
difference is left to the eye: two overlays on one chart, and a reader deciding whether they agree.
This is the cheapest statement of it that can be written down. Take each detector's **newest**
pivot, and ask whether the simple leg's mark landed on a later bar than the zigzag's vertex.

- **After is `True`.** Strictly: the mark sits on a bar past the vertex. The simple legs, having no
  smoothing, usually turn first and sit *behind* — a mark that has got ahead of the vertex is the
  interesting case and the one this reports.
- **The same bar is `False`**, and so is earlier. Two detectors agreeing on the bar is exactly not
  a displacement, and folding it in with "the mark came first" would make the two readings
  indistinguishable.
- **Side is not consulted.** The newest vertex against the newest mark, whatever direction each is
  on. A high marked after a low vertex is still the simple legs running ahead, and asking the two
  to match sides would answer a different question — "did *this* turn get marked late" — which
  needs a pairing rule this Pattern deliberately does not have.
- **The mark must be confirmed.** `simple-leg` appends a `provisional` mark on the newest bar
  whenever a leg is still running, so the newest mark is nearly always sitting at the right edge,
  past everything. Reading it would make the answer `True` on almost every run — a reading that
  varies with the clock rather than with the market. The last mark with `provisional` false is the
  one compared, and the marks in between are skipped whatever their flag says.

Two things about the output are unusual for this package and worth saying plainly:

- **At most one Point, and only for the newest pair.** Every other Series here reports every
  occurrence in its window; this reports the window's right edge and nothing else. The cost is that
  **the history of past offsets is not recoverable from this Series** — a caller wanting "how often
  were they displaced" has to walk `zig-zag` and `simple-leg` itself. That is what asking only
  about the most recent pivots buys, and it is a real loss, not a simplification.
- **It repaints.** A new confirmed mark or a new zigzag vertex replaces the Point outright rather
  than adding one, and nothing in the Point says it has moved.

Empty when either detector said nothing in the window, or when every mark is still provisional.
Nothing to compare is not `False`: a run with no legs in it has not shown the two detectors
agreeing, and reporting that it did would be the Series answering a question it never read.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .simple_leg import LegMark
from .zigzag import ZigZagPivot


@dataclass(frozen=True, slots=True)
class PivotOffset(Candle):
    """The newest confirmed simple-leg mark, and whether it sits past the newest zigzag vertex.

    A `Candle` and not a `Pivot`, on `ConsecutiveDirection`'s precedent: the answer is a fact about
    which of two bars came later, and naming a price would be this Series inventing a level it
    never read. The mark's own price is in `simple-leg`, where it was decided.

    Anchored on the mark rather than on the vertex — the later of the two whenever `offset` is
    `True`, so the Point sits where the displacement is. The vertex's bar is not carried, for the
    reason `ConsecutiveDirection` gives about the bars behind it: `zig-zag` is already on the wire
    under its own producer key, and restating its newest vertex here would claim a fact another
    Series holds and let the two drift.
    """

    #: `True` when the mark's bar is strictly later than the vertex's. `False` on the same bar or
    #: earlier. Never `None` — a pair that cannot be formed emits no Point at all.
    offset: bool


def _confirmed(marks: Sequence[LegMark]) -> LegMark | None:
    """The newest mark that is not provisional, or `None` when every one of them is.

    Walks backwards and tests the flag rather than dropping `marks[-1]`. Today only the last Point
    of a `simple-leg` Series can be provisional, so the two are the same walk — but that is
    `SimpleLegPattern`'s promise about its own output, not this rule's to depend on.
    """
    for mark in reversed(marks):
        if not mark.provisional:
            return mark
    return None


def pivot_offset(
    marks: Sequence[LegMark], pivots: Sequence[ZigZagPivot]
) -> list[PivotOffset]:
    """The one comparison, or nothing at all.

    Takes plain sequences rather than Series, as every rule here does: the answer is fully
    determined by the two it is handed, and asking for the Series would advertise a dependency on
    identity that does not exist.

    Returns a list rather than an optional Point so the adapter has nothing to branch on, and so a
    later change of mind about "at most one" is a change to this function alone.
    """
    mark = _confirmed(marks)
    if mark is None or not pivots:
        return []

    # `>` and not `>=`. Landing on the vertex's own bar is the two detectors agreeing, which is the
    # `False` case — see the module docstring.
    return [PivotOffset.anchored(mark, offset=mark.time > pivots[-1].time)]


class PivotOffsetPattern(Pattern):
    """`pivot_offset` as a Pattern: one reading of the two detectors at the right edge.

    Two sources, each an **instance** rather than a producer key, for the reason every two-source
    Pattern here gives: a string restates what `Pattern.producer` derives, and the two fall out of
    step as a `KeyError` at run time instead of an error at import.

    - `source` — the `SimpleLegPattern` whose newest *confirmed* mark is one half of the pair. Its
      provisional mark is skipped, unlike in `GeneralDirectionPattern`, which reads every mark: that
      one is describing a turn in formation, and this one is comparing two settled answers.
    - `pivots` — the `ZigZagPattern` whose newest vertex is the other half.

    No dials. What counts as later, and which mark is eligible, are both settled in the module, and
    both sources are tuned at the pipeline site.

    Declare it after both sources. There is no dependency graph, and the wrong order leaves the key
    absent from `ctx` with the reason only in the log.
    """

    name = "Pivot offset"

    def __init__(
        self,
        *,
        source: Pattern,
        pivots: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.pivots = pivots

    def run(self, ctx: Ctx) -> BaseSeries[PivotOffset]:
        """Zero or one Point, anchored on the mark's bar. The Candles of `emits` are never read."""
        marks: BaseSeries[LegMark] = ctx[self.source.producer]
        pivots: BaseSeries[ZigZagPivot] = ctx[self.pivots.producer]

        return BaseSeries(
            SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits),
            pivot_offset(marks.points, pivots.points),
        )
