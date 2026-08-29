"""Which simple legs ran inside each zigzag leg.

Two detectors read the same bars and disagree on purpose. `ZigZagPattern` is smoothed and names
few vertices; `SimpleLegPattern` has no smoothing and marks several times more often. Until now
nothing joined them — the monitor drew both and the eye did the grouping. This module does that
grouping in the engine.

Both halves already exist as Series, so nothing here is measured and no new geometry is invented:

- `leg-window` gives each zigzag leg, with `end` naming its closing vertex inside `bars`.
- `leg(source=<simple-leg(…)>)` gives one `Leg` per simple leg, anchored on its first bar.

The rule is one comparison. A simple leg belongs to the zigzag leg it **starts inside**:

```
window.bars[0].time  <  leg.time  <=  window.bars[window.end].time
```

`Leg` anchors on its first bar, so `leg.time` *is* where the simple leg starts. The interval is
left-exclusive and right-inclusive, and both ends are deliberate:

- **Left-exclusive** — a simple leg starting on the opening vertex started *on* the boundary bar,
  which closes the previous zigzag leg. It goes there, not here.
- **Right-inclusive, at the closing vertex** — not at the end of `bars`. A `LegWindow` carries
  `ahead` further bars past its close, and those bars belong to the leg that follows. Grouping by
  them would put one simple leg in two groups.

Together those make the zigzag legs a **partition**: leg `i` owns `(vertex_i, vertex_i+1]`, leg
`i + 1` owns `(vertex_i+1, vertex_i+2]`, and no simple leg is in two groups even though the
`LegWindow`s themselves overlap by `ahead + 1` bars.

What it costs, stated rather than hidden:

- **Simple legs outside every zigzag leg are dropped.** Those starting at or before the first
  vertex, and those starting after the last one, are in no group. Nothing reports them; read this
  Series as "per zigzag leg", never as "every simple leg".
- **The first and last `Leg` of the source are not vertex-to-vertex.** `split_legs` folds the
  window's head into its first leg and its tail into its last. The first is dropped by the rule
  above, since it starts on the window's very first bar. The last is kept whenever it starts
  inside a zigzag leg — and then it runs *past* that leg's close, since it swallows the
  remainder of the window. It is the only member whose bars can leave its group; the grouping is
  by where a leg starts, and that stays true of it.
- **The last group is still open.** Unlike `LegExtremesPattern`, which drops the newest leg
  because its vertex is provisional, every leg is grouped here. Nothing is measured, so a
  provisional vertex costs nothing but a group that will still grow — and dropping it would drop
  the newest simple legs, which is the part being watched. Its final `Leg` may itself close on a
  provisional `LegMark`.
- **An empty `inside` is a fact, not a gap.** A zigzag leg the simple detector marked nothing
  inside of still gets a Point. That count is how far apart the two detectors are, and hiding it
  would hide exactly that.
- **Every bar is serialized again**, and more than once: this Point carries a whole `LegWindow`
  and every `Leg` inside it, both of which are already on the wire in their own Series. It is
  carried anyway so that one Point answers the question whole — see `NestedLegs.leg`.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..timeframes import Timeframe
from .leg_processor import Leg
from .leg_window import LegWindow


@dataclass(frozen=True, slots=True)
class NestedLegs(Candle):
    """The simple legs that ran inside one zigzag leg. Anchored on the leg's opening vertex.

    The same anchor as the `LegWindow` it groups for, so `as_of` answers "which group is running
    now" and a join against `leg-window` or `leg-extremes` is by `time`, as it is between those
    two.
    """

    #: The zigzag leg itself, whole — its bars, `since` and `end`.
    #:
    #: Carried rather than left to a join on the anchor, deliberately unlike `LegExtremes`, which
    #: refuses to restate `since`/`end`. The question this Pattern answers is a *relationship*
    #: between two Series, and a Point that names only one side of it cannot be read on its own.
    #: The cost is the leg's bars on the wire a second time, and it is a real one.
    leg: LegWindow
    #: The simple legs that start inside `leg`, in order, ending at its closing vertex. Empty is
    #: ordinary: it means the simple detector marked no turn inside this leg.
    inside: tuple[Leg, ...]


def nested_legs(windows: Sequence[LegWindow], legs: Sequence[Leg]) -> list[NestedLegs]:
    """One `NestedLegs` per window, in order, each holding the legs that start inside it.

    Takes the Points of both Series rather than the Series themselves, like every other rule in
    this package: the grouping knows nothing about identity, and the adapter below is where a
    Series is made.

    One walk over each input. Both are ordered by anchor `time` — `BaseSeries` refuses anything
    else — and the windows partition the line, so a leg that is too early for one window is too
    early for every window after it and can be stepped past for good.

    Empty for empty `windows`. Legs outside every window are dropped; see the module docstring.
    """
    grouped: list[NestedLegs] = []
    at = 0

    for window in windows:
        opened = window.time
        closes = window.bars[window.end].time

        # Legs that start at or before this window's opening vertex belong to an earlier window,
        # or to no window at all. Either way they are behind us: the windows only move forward.
        while at < len(legs) and legs[at].time <= opened:
            at += 1

        first = at
        while at < len(legs) and legs[at].time <= closes:
            at += 1

        grouped.append(NestedLegs.anchored(window, leg=window, inside=tuple(legs[first:at])))

    return grouped


class NestedLegsPattern(Pattern):
    """`nested_legs` as a Pattern: each zigzag leg, and the simple legs that ran inside it.

    Two sources, and each is an **instance** rather than a producer key, for the reason
    `LegPattern` gives: passing the key as a string restates what `Pattern.producer` derives, and
    the two fall out of step as a `KeyError` at run time instead of an error at import.

    - `source` — the `LegWindowPattern` whose legs are grouped *into*.
    - `legs` — the `LegPattern` whose legs are grouped. Meant to be the one built on
      `SimpleLegPattern`.

    Nothing checks that `legs` is the simple detector's slicer. It cannot: a `Leg` carries no
    record of which detector cut it, so a `LegPattern` over the same zigzag would group each leg
    into the leg it already is, and every assertion downstream would still hold. That mistake is
    caught by reading the producer key, which names the whole chain.

    No dials. There is nothing to tune — the grouping is one comparison, and the one choice that
    could be made differently, whether the tail counts, is settled in the module docstring and is
    not a knob.

    `ctx["bars"]` is never read: every bar in play arrives inside a `LegWindow` or a `Leg`, so
    there is no window to translate an index against and no `bar_positions` call here.

    Declare it after both sources. There is no dependency graph, and the wrong order leaves the
    key absent from `ctx` with the reason only in the log.
    """

    name = "Nested legs"

    def __init__(
        self,
        *,
        source: Pattern,
        legs: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.legs = legs

    def run(self, ctx: Ctx) -> BaseSeries[NestedLegs]:
        """One Point per leg of `source`, anchored where that leg is, holding the legs inside it.

        Anchors are the windows' own, untouched and complete, so they are ordered exactly as
        `LegWindowPattern` left them and `BaseSeries` has nothing to object to.
        """
        windows: BaseSeries[LegWindow] = ctx[self.source.producer]
        legs: BaseSeries[Leg] = ctx[self.legs.producer]

        points = nested_legs(windows.points, legs.points)

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
