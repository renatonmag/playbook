# ADR-0003 — The Point model's expressiveness limits are known and deferred

- **Status**: Accepted — the deferral is the decision. Amended 2026-08-12: **Multi-timeframe
  Pattern is closed**; the other five cases remain **open**.
- **Date**: 2026-08-09
- **Supersedes nothing. Constrains** [ADR-0002](0002-series-is-a-list-of-typed-points.md).
- **Ticket**: raised while working the map, [#1](https://github.com/renatonmag/playbook/issues/1)

## Context

ADR-0002 fixed a Series as `list[TPoint]`, with a Point anchored at a Candle (`time`, after
that ADR's 2026-08-12 amendment made the Candle the root of the Point hierarchy),
carrying a subclass-declared payload — which, for an extended Pattern, includes a `since`
marking where the occurrence begins — and a Series identified by
`(producer, instrument, timeframe)`.

Comparison against higher-level algo-trading frameworks — Lumibot, Nautilus Trader — surfaced
that this model is **opinionated about what a Pattern can be**. Those frameworks generalise
because their user is a stranger writing a strategy they will never see. Playbook has one
owner, so the opinion is affordable — but it should be an opinion held knowingly, not a limit
discovered later by whoever builds the engine.

This ADR exists to make the boundary explicit. Everything below is a case the current model
**cannot express**, recorded before construction rather than after.

## Decision

**Build against the current Point model. Revisit the table below before construction
finishes, not after.**

Each case is left open deliberately. None is ruled out; none is designed for yet.

| Case | What it is | What breaks |
|---|---|---|
| **Multi-instrument Pattern** | Spread, long/short pair, relative strength against IBOV | `identity` is `(producer, instrument, timeframe)` — one Instrument, hard-coded. Would have to lose the Instrument, or hold a set. **Hardened** by [#3](https://github.com/renatonmag/playbook/issues/3): one `PatternEngine` per Instrument makes this a limit of the engine, not only of the Point. |
| ~~**Multi-timeframe Pattern**~~ | ~~"Wedge on `1h` confirmed by a breakout on `5m`"~~ | **Closed** — see below. |
| **Pattern not ending at the current Candle** | A formation completed 8 bars ago that only matters now | Event detectors are evaluated **only at the current Candle**, by decision. Nothing sweeps backwards. |
| **Non-contiguous extent** | Divergence between two distant Pivots, where the middle is irrelevant | An extended Pattern's `since..time` assumes one contiguous run. It describes this badly. Would need `since` to become a list of segments — a subclass-local change now, since `since` is no longer on the base Point. |
| **Projection into the future** | Target price, apex ahead of price, an extended trendline | `time` must be a real Candle. The chart agrees: `timeToCoordinate` returns `null` off-scale (see [the Lightweight Charts research](https://github.com/renatonmag/playbook/issues/7)). |
| **Non-Candle input** | Order book, volume profile, news, fundamentals | Series is Candle-anchored by definition. This one dissolves the alignment model entirely. |

### Amendment, 2026-08-12 — Multi-timeframe Pattern is closed

Elected as a real case while working [#3](https://github.com/renatonmag/playbook/issues/3): a
Pattern must be able to read `5m` and `1h` at once. The open question was which Timeframe the
*output* belongs to.

**A Pattern declares `reads` and `emits` separately.** `reads` is the set of Timeframes it
looks at; `emits` is the single Timeframe its output Series belongs to, and its `Point.time`
anchors to a Candle of that Timeframe —
`WedgeConfirmed(reads=("1h","5m"), emits="1h")`.

`identity`, `Point`, `BaseSeries` and ADR-0002 are **untouched**. What changed is only the
Pattern's declaration, which now has two fields where it had one — separating "where I read
from" from "where I mark the occurrence", two things that were coupled by accident.

Rejected: inferring the output as the finest Timeframe read (wrong for the first Pattern that
confirms the fine with the coarse and wants to emit on the coarse); and `identity` holding a
*set* of Timeframes — the generalisation trap this ADR warns about, since it would make every
Series vaguer to serve one Pattern.

Two cases were checked and **do** fit, and are not open: a classifier's probability or
confidence score (that is payload), and a state rather than an occurrence — "the day is
trending" is a Point anchored at the current Candle with a boolean payload.

## Consequences

- Whoever builds the engine knows these are chosen limits, not oversights.
- The order in which these get taken matters, because they pull the structure in
  incompatible directions. Multi-instrument wants the Instrument out of the identity;
  non-contiguous extent wants `since` to become a list, though only inside the Point
  subclasses that declare one; non-Candle input wants Series to stop being Candle-anchored.
  Taking them one at a time, in the wrong order, means rework.
- **The generalisation trap is the risk to watch.** A Point that accommodates all six is not
  general, it is an empty bag — and then nothing can consume a Pattern's output without
  knowing exactly which Pattern produced it, which is the opposite of pluggable. Each case
  should be taken because it is needed, not because it is conceivable.
- The deferral is cheap to reverse for the first three and expensive for the last three.
  Non-Candle input is the one that would justify a new map rather than an amendment.

## Related — resolved

A second thread was raised alongside this one: **pluggability of detection method** —
hand-written rules today, TA-Lib, a trained classifier, or an LLM reading the chart later. It
was referred to [#3](https://github.com/renatonmag/playbook/issues/3) and closed there: the
contract is `run(ctx) -> Series` and nothing more, so the method is the Pattern's own business.
The guess above held — ADR-0002's single output currency is what *enables* plurality of method.
The one known cost is elsewhere: the engine is synchronous and serial, so a Pattern that calls
the network stalls the whole tick.
