"""Every simple leg of the last session, with everything already measured about it on the row.

Six Series answer parts of one question and none of them can be read side by side. `legs` says
which bars each leg is made of and anchors on the leg's **first** bar; `retracement` says how much
of the move before it each leg gave back and anchors on the **reach** bar of the pivot that closed
it; and the four `leg-target` Series say which lines a leg ran into — two kinds a person pinned and
the two moving averages this pipeline computes — anchoring on the leg's **extreme** bar and emitting
nought to several Points per leg. Three anchors, three cardinalities. A reader wanting one sentence
about the sequence of legs in front of it has to re-cut the legs to line them up.

This is that line-up, done once and done here. One Point per leg, in leg order, so the Series *is*
the sequence — walk it and the story is in order. The browser reads rows; it does not join.

The join is index arithmetic, and it is exact rather than approximate. For `n` marks from
`simple-leg`: `split_legs` cuts `n - 1` legs, leg `j` running from mark `j` to mark `j + 1`;
`LegReachPattern` emits one Point per mark in the same order; and `retracements` emits one entry per
consecutive pair, `n - 1` of them, the `j`-th closing on pivot `j + 1`. **So leg `j` and retracement
Point `j` are the same leg**, and `Retracement.direction` is that leg's closing side — the very fact
`leg_target.py` goes to the marks Series for. Nothing here needs the marks, and nothing here needs
the bars.

The rules:

- **One Point per leg, paired by index** with the retracement Series, which is dense in its legs.
  Not paired by `time`: the two anchor on different bars by design, and matching them on a
  timestamp would be inventing an agreement neither Series claims.
- **Targets join by the leg's last bar.** A `LegTarget` carries `end`, which is the leg's closing
  bar, so a dict keyed on `end.time` is the whole of it — the `.time`-keyed idiom `_holders` uses.
  The four target Series are kept apart on the row — `levels`, `trends`, `averages`,
  `hourly_averages` — because a level, a sloped line and each of the two averages are claims about
  different lines, and one list could not be read back into four. The two average fields hold at
  most one target each: an average's relations Series carries exactly one line id and a line's
  respect groups are disjoint runs, so at most one group can cover a leg's extreme. A tuple anyway,
  so that all four read the same way — that is a fact about how the pipeline declares them, not
  about the type.
- **The reach is recomputed, not read.** `extreme_points(leg.bars, direction)[0]`, the same call
  `leg_target.py` and `leg_reach.py` both make over the same bars for the same leg, so it is one
  rule read three times rather than three opinions. A `LegTarget` carries a `reach` price too, but
  only when the leg hit something, and a row needs the number either way.
- **Only the last day.** The date of the newest bar, and a leg belongs to it if any of its bars do.
  A leg's bars are contiguous, so that is one comparison on `bars[-1]`. Which makes this the only
  Series in this package that is not the whole window.

What it deliberately does not do, and what that costs:

- **It does not read the Candles.** The last leg's last bar *is* the window's newest bar —
  `split_legs` folds the tail into it — so even the day comes off the sources. The cost is the one
  every Series-only Pattern accepts: legs and targets cut from two different Timeframes would be
  joined without complaint. The count guard below is the only thing standing there, and it catches
  a miswired source rather than a mismatched one.
- **The running leg is emitted untrimmed**, unlike `leg-extremes` and `leg-target`, which both drop
  it. Two consequences, and they are not small. `split_legs` folds every bar after the last mark
  into that leg, and those bars belong to the *next* leg, which runs the other way — so its `reach`
  can be a bar from a leg that has not been marked yet, the mixing `leg_processor.py` warns about.
  And its `end` is the newest bar rather than a mark, so no target can ever join to it: all four
  target fields are empty there because nothing measured that leg, not because it hit nothing.
  `provisional` is the one flag that separates those two readings of an empty list, and a reader that
  does not consult it will report the leg in progress as having reached nothing — including against
  the averages, which are otherwise filled on every run.
- **The first leg carries the window's head**, the same fold at the other end, so its `reach` can
  also come from a leg that was never emitted. A property of the source, restated rather than fixed
  — `leg_extremes.py` and `leg_target.py` accept the same one.
- **Every bar is on the row.** `bars` recurses through `to_dict`, and each target restates the
  leg's `start` and `end` on top of that, so one leg's candles travel several times over. Carried
  anyway, and for `NestedLegs`' reason: this Series exists to be read on its own, and a row that
  names a leg without holding it sends its reader back to join against `legs`.
- **Two of the four target fields are empty without a `POST` and two are never empty for that
  reason**, and that asymmetry is the sharpest edge on this Point. `levels` and `trends` are
  downstream of lines a person pinned, so on the automatic run they are empty whatever the legs did;
  `averages` and `hourly_averages` are downstream of averages this pipeline computes from closes it
  already holds, so they are filled on every run. Which makes a row off the `GET` right about four
  of its six readings and silently wrong about two — worse than being wrong about all of them,
  because it looks like an answer. The web app carries the repair rather than this module: the Log
  shows the automatic copy until a run with lines answers the same key, and prefers that one after.
  Nothing on the Point says which copy it is, and nothing can — the key is identical either way.
- **It measures nothing itself.** Every number here was computed upstream or by a shared helper.
  So its fidelity is whatever it was pointed at — a `retracement` read off a raw detector rather
  than off a reach understates every fraction, and nothing on the row says which it was. That is a
  decision for the pipeline, as `retracement.py` says of itself.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ..candles import Candle
from ..engine import INSTRUMENT
from ..pattern import Ctx, Pattern
from ..series import BaseSeries, SeriesIdentity
from ..shape import Direction
from ..timeframes import Timeframe
from .leg_extremes import LegPoint, extreme_points
from .leg_processor import Leg
from .leg_target import LegTarget
from .retracement import RetracedMove, Retracement


@dataclass(frozen=True, slots=True)
class LegRecap(Candle):
    """One leg, and every reading this installation has of it. Anchored on the leg's first bar.

    The `Leg` convention, and deliberately that one: an interval is identified by where it begins,
    which is what makes `as_of` answer "which leg is running now". The readings hung on it anchor
    elsewhere — a retracement on the closing pivot's reach bar, a target on the extreme bar — and
    each carries its own `time`, so nothing is lost by moving them here.

    Not a summary and not a rollup: nothing on this Point was measured here. It is six Series
    written onto one row, in leg order.
    """

    #: The leg's Candles, as `Leg` cut them — inclusive at both ends, so the bar shared with the
    #: next leg is in both. See the module docstring on what this costs on the wire.
    bars: tuple[Candle, ...]
    #: The leg's last bar: the mark it was cut at, except on the running leg, where it is the
    #: window's newest bar and no mark at all.
    end: Candle
    #: The leg's own move — `bullish` for a leg that rose into a top. Read off the closing pivot's
    #: side, translated to `shape.Direction` the way `leg_target.py` translates it, so this row and
    #: the targets hanging on it cannot disagree about which way the leg ran.
    direction: Direction
    #: How far the leg got: `extreme_points`' first reading over the leg's own bars, carried whole
    #: rather than as a price, so the bar it happened on is on the row. `LegTarget.reach` is the
    #: same number where a target exists; this is there for every leg.
    reach: LegPoint
    #: What the leg gave back, or `None` — copied from the retracement Point for this leg, absence
    #: and all. `None` means *not measured in this window* and never "unmeasurable"; see
    #: `retracement.py` for the three causes it does not tell apart.
    measured: RetracedMove | None
    #: The levels this leg ran into and was held by, as `leg-target` emitted them. Empty on a leg
    #: that hit nothing — and on the running leg, which nothing measured. `provisional` separates
    #: those.
    levels: tuple[LegTarget, ...]
    #: The same against the sloped lines. A separate field rather than a second list appended to
    #: `levels`, for the reason the pipeline declares two `LegTargetPattern`s: the two are readings
    #: of different lines, and a reader must be able to tell which it has.
    trends: tuple[LegTarget, ...]
    #: The moving average this leg ran into and was held by — `wma-30`, as `average-target` emitted
    #: it. **At most one**, for the reason the module docstring gives, and a tuple anyway so that all
    #: four target fields read alike.
    #:
    #: Unlike `levels` and `trends`, this is filled on the automatic run: the line it is about is
    #: arithmetic over closes, not something a person drew. So empty here means the leg reached the
    #: average and was not held by it, or never reached it — never "nobody has run this yet".
    averages: tuple[LegTarget, ...]
    #: The same against the hourly-bucketed average, `wma-30-1h`. Two fields rather than one list
    #: told apart by `line`, so a reader needs neither of those two strings to read a row — though
    #: each target does carry its average's name, since an average names its own line.
    hourly_averages: tuple[LegTarget, ...]
    #: True for the **last** leg only: it closes on the newest mark the detector produced, so its
    #: bars are recut by every close. Copied from the retracement Point rather than read
    #: positionally again — one positional rule, decided upstream, not two that could disagree.
    provisional: bool


def _hits(targets: Sequence[LegTarget]) -> dict[datetime, list[LegTarget]]:
    """Every target, as a lookup from the closing bar of the leg it names to the targets on it.

    Keyed on `end.time` rather than on the target's own anchor: a target anchors on the extreme
    bar, which says where price got to and not which leg got it there, and two adjacent legs can
    make their extremes on one candle. The closing bar is the leg's identity.

    Built once rather than scanned per leg, `_holders`' reason: the question asked of it is always
    the same one.
    """
    found: dict[datetime, list[LegTarget]] = {}

    for target in targets:
        found.setdefault(target.end.time, []).append(target)

    return found


def leg_recaps(
    legs: Sequence[Leg],
    measures: Sequence[Retracement],
    levels: Sequence[LegTarget],
    trends: Sequence[LegTarget],
    averages: Sequence[LegTarget],
    hourly_averages: Sequence[LegTarget],
) -> list[LegRecap]:
    """The legs of the newest day in `legs`, each with its retracement and its targets on it.

    Plain sequences in and out, the `split_legs` and `line_respects` precedent: the rule knows
    nothing about Series.

    Anchors come out non-decreasing for free — legs start at successive marks and the day filter
    keeps a suffix of them — so there is no sort here.

    Raises `ValueError` where the two dense sources disagree about how many legs there are, which
    can only mean they were cut from different detectors. The one benign disagreement is a window
    holding a single mark: `split_legs` answers one leg, being the whole window, and `retracements`
    answers none, since one vertex names no pair to run between. That leg is the head fold with
    nothing on either side of it, and it is emitted as nothing rather than as a row of absences.
    """
    if not legs:
        return []

    if len(legs) == 1 and not measures:
        return []

    if len(legs) != len(measures):
        raise ValueError(
            f"{len(legs)} legs against {len(measures)} retracements — "
            "the legs and the measurements are from different detectors"
        )

    # One lookup per kind of line rather than one merged: which kind a target is about is a field on
    # the row, and merging them here would mean splitting them again by `line` to write it.
    hits = [_hits(targets) for targets in (levels, trends, averages, hourly_averages)]
    # The last leg swallows the window's tail, so its last bar is the newest bar of the window and
    # the Candles never have to be read to find the day. See the module docstring.
    day = legs[-1].bars[-1].time.date()

    found: list[LegRecap] = []

    for leg, measure in zip(legs, measures):
        close = leg.bars[-1]
        if close.time.date() != day:
            # Contiguous bars, so the last one is the latest: a leg whose close is earlier than the
            # day did not reach into it at all, and one whose close is on it did.
            continue

        direction: Direction = "bullish" if measure.direction == "high" else "bearish"

        found.append(
            LegRecap.anchored(
                leg.bars[0],
                bars=leg.bars,
                end=close,
                direction=direction,
                # Only the first of the three readings: a recap says how far the leg reached.
                reach=extreme_points(leg.bars, direction)[0],
                measured=measure.measured,
                levels=tuple(hits[0].get(close.time, ())),
                trends=tuple(hits[1].get(close.time, ())),
                averages=tuple(hits[2].get(close.time, ())),
                hourly_averages=tuple(hits[3].get(close.time, ())),
                provisional=measure.provisional,
            )
        )

    return found


class LegRecapPattern(Pattern):
    """`leg_recaps` as a Pattern: the day's simple legs with their retracements and their targets.

    Six sources, all of them **instances** rather than producer keys — the reason `LegPattern`
    gives: a key written as a string restates what `Pattern.producer` derives, and the two fall out
    of step as a `KeyError` at run time instead of an error at import. `LegBreaksPattern` is the
    precedent for reading several at once, and the warning that comes with it, which this many makes
    louder: the more Series one Point joins, the more of the pipeline has to be declared right for it
    to answer at all.

    - `source` — the slicer whose legs are the rows. Its Points must carry `bars`.
    - `measures` — the retracement over the **same** detector's legs, and the only thing here that
      says which way a leg ran. One per leg, dense, index-aligned with `source`; a `Retracement`
      over a different detector would pass the count guard and be wrong on every row, which is why
      the pipeline site declares both off one chain.
    - `levels`, `trends`, `averages`, `hourly_averages` — the four target instances, one per kind of
      line, kept apart because their Points cannot be told apart once they are in one list. Six
      named parameters rather than one sequence of them, so every source here is a single `Pattern`
      the way it is on every other Pattern in this package; a seventh line to watch would be a
      seventh parameter, and that is the right amount of friction for a row this wide.

    A class-level `name`, unlike the Patterns it reads: the pipeline declares this once. Every
    reading it carries is already labelled by whichever Series it came from.

    No dials. Every number is upstream's, the day is the newest bar's, and the detectors are tuned
    at the pipeline site.

    Declare it after all four sources. There is no dependency graph, and the wrong order leaves the
    key simply absent from `ctx` with the reason only in the log.
    """

    name = "Leg recap"

    def __init__(
        self,
        *,
        source: Pattern,
        measures: Pattern,
        levels: Pattern,
        trends: Pattern,
        averages: Pattern,
        hourly_averages: Pattern,
        reads: tuple[Timeframe, ...],
        emits: Timeframe,
    ) -> None:
        super().__init__(reads=reads, emits=emits)
        self.source = source
        self.measures = measures
        self.levels = levels
        self.trends = trends
        self.averages = averages
        self.hourly_averages = hourly_averages

    def run(self, ctx: Ctx) -> BaseSeries[LegRecap]:
        """One Point per leg of the newest day, anchored on the leg's first bar.

        The Candles of `emits` are never read — every bar this needs is inside a `Leg` already, and
        so is the newest one. So this runs with no bars in `ctx` at all, which is the sharpest
        statement of what it depends on; `retracement.py` makes the same one about itself.
        """
        legs: BaseSeries[Leg] = ctx[self.source.producer]
        measures: BaseSeries[Retracement] = ctx[self.measures.producer]
        levels: BaseSeries[LegTarget] = ctx[self.levels.producer]
        trends: BaseSeries[LegTarget] = ctx[self.trends.producer]
        averages: BaseSeries[LegTarget] = ctx[self.averages.producer]
        hourly: BaseSeries[LegTarget] = ctx[self.hourly_averages.producer]

        points = leg_recaps(
            legs.points,
            measures.points,
            levels.points,
            trends.points,
            averages.points,
            hourly.points,
        )

        return BaseSeries(SeriesIdentity(self.producer, ctx[INSTRUMENT], self.emits), points)
