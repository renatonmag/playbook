# ADR-0002 — A Series is a list of typed Points, not a column of values

- **Status**: Accepted
- **Date**: 2026-08-09
- **Ticket**: [#2 — O que BaseSeries guarda e o que ela expõe](https://github.com/renatonmag/playbook/issues/2)

## Context

`BaseSeries` is the base class every Series inherits from, and the one interface every
Pattern class touches. It is the most expensive decision in the engine to reverse.

Three kinds of output have to fit in it:

| | anchoring | span | payload |
|---|---|---|---|
| `sma-20` | every Candle | 1 bar | a number |
| `inside-bar` | current Candle | 2 bars | nothing |
| wedge | current Candle | ~30 bars | three top Pivots, three bottom Pivots, geometry |

Python was chosen for its data ecosystem, which argues for a pandas DataFrame or a numpy
array — a column of values aligned to the Candles of the window. But a wedge is not a value
at a Candle. It is an occurrence that spans thirty bars, completes on the current one, and
carries a variable number of vertices. A column of scalars cannot hold it, and the wedge is
the case that motivates the product.

A second question sat underneath: does a Pattern evaluate its rule across the whole day's
window, or only at the Candle that just closed? Nothing survives a tick, so any history in an
output Series would have to be recomputed rather than remembered.

## Decision

**`BaseSeries[TPoint]` holds an ordinary `list[TPoint]`.** What varies between subclasses is
the *type of the Point*, not the structure holding them.

**A Point is a frozen dataclass with `at` and `since`**, plus whatever payload its Pattern
declares. `at` is the anchor Candle; `since` is where the occurrence begins, equal to `at`
when punctual. Vertices are expressed with a shared **`Pivot`** type — a price at a Candle —
so a three-top wedge and a four-top wedge are the same class, and `double-top`,
`head-and-shoulders`, and `triangle` reuse it instead of each inventing `top1_price`,
`top2_price`.

**Methods on a Point are permitted but must be pure derivation of its attributes.** Nothing
may be held only in behaviour.

**`BaseSeries` is concrete.** Its full surface is `identity` — `(producer, instrument,
timeframe)`, stored on the object — `points`, positional `s[i]`, `len`/`iter`/`bool`, and
`to_dict()`. No abstract members.

**Event detectors are evaluated only at the current Candle**; indicators, being continuous
functions of the Candles, carry a Point at every Candle of the window.

## Consequences

- A new Pattern costs one Point dataclass. There is no Series subclass to write.
- The wedge fits without reviving `Detection`: it is one Point, `at` on bar 50, `since` on
  bar 20, carrying its Pivots.
- `ma-cross` works, because `sma-20` — an indicator — has a Point at the previous Candle.
- `since` gives Validation the exact price action to send the LLM. Without it, someone
  downstream has to guess how much context a wedge deserves.
- Serialization is total: because Points are frozen and behaviour is pure derivation,
  `to_dict()` loses nothing that Validation or the development UI needs.
- Cost: **no vectorized arithmetic over Series**. A mean over a list of dataclasses is a
  Python loop. This is recoverable inside a Pattern — `sma-20` computes with numpy over the
  Candles' closes and only packs Points at the end; the Point list is the *interface*, not
  the compute substrate. It becomes a real problem only if a Pattern needs heavy numerics
  over *another Pattern's* output, which no known Pattern does.
- Cost: an event detector cannot see its own past occurrences. Accepted deliberately — ticks
  are independent, and only a trigger on the current bar is worth anything.

## Alternatives considered

- **pandas DataFrame indexed by Candle timestamp, columns declared per subclass.** Free
  alignment, free vectorization, `NaN` as a first-class hole. Rejected: heterogeneous
  payloads fall to `object` dtype anyway, a whole DataFrame to carry one wedge row is
  structure for nothing, and the variable-length Pivot list has no natural column form.
- **A flat array of scalars aligned to the window.** The cheapest and fastest option, and the
  one the Python-for-data argument points at. Rejected because the wedge does not fit, and
  the wedge is the point.
- **Evaluating detectors across the whole day's window each tick.** Would give composed
  Patterns real history to slice. Rejected: nothing persists, so the history would be
  recomputed noise, and an alarm only cares about what fired now.
- **Two currencies — Candles as input, an `Occurrence` type as output.** Considered when the
  Point type briefly looked too small to hold OHLCV. Rejected: a Point with a subclass-declared
  payload holds a Candle as easily as a wedge, and one currency is what lets Patterns consume
  each other.

## Deliberately left out

- **Slicing a Series into another Series.** Returns if a Pattern needs to cut Candles between
  two Pivots.
- **Aligning Series of different Timeframes.** That is a resampling policy, and it belongs to
  whoever resolves the graph — see [#5](https://github.com/renatonmag/playbook/issues/5).
- **Whether the producer in `identity` is a plain Pattern id or a parameterised key**
  (`sma-20` vs `sma(period=20)`) — see [#3](https://github.com/renatonmag/playbook/issues/3).
