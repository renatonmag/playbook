# ADR-0002 — A Series is a list of typed Points, not a column of values

- **Status**: Accepted — amended 2026-08-11 (`since` moved off the base Point onto the Point
  subclasses of extended Patterns) and 2026-08-12 (**the base Point class is gone: the Candle
  is the root, and the anchor is `time`** — see the amendment at the bottom, which overrides
  every mention of `at` and of a `Point` base class below).
- **Date**: 2026-08-09
- **Ticket**: [#2 — O que BaseSeries guarda e o que ela expõe](https://github.com/renatonmag/playbook/issues/2)

- **Problem**: `BaseSeries` is the one interface every Pattern touches, and it must hold three
  shapes of output at once — `sma-20` (a number at every Candle), `inside-bar` (nothing, over
  2 bars), and a wedge (variable Pivots over ~30 bars, completing on the current one).
- **Decision**: `BaseSeries[TPoint]` holds an ordinary `list[TPoint]`. What varies between
  subclasses is the *type of the Point*, not the structure holding them.
- A Point is a frozen dataclass whose only base contract is `at`, the anchor Candle. Methods
  are allowed but must be pure derivation — nothing may be held only in behaviour.
- A Pattern spanning several Candles declares `since` on its own Point subclass; vertices use a
  shared `Pivot` type (a price at a Candle), so `double-top`, `head-and-shoulders`, and wedges
  reuse one vocabulary instead of inventing `top1_price`.
- `BaseSeries` is concrete, with no abstract members: `identity` (producer, instrument,
  timeframe), `points`, `s[i]`, `len`/`iter`/`bool`, and `to_dict()`.
- Event detectors are evaluated only at the current Candle; indicators carry a Point at every
  Candle of the window. This is why `ma-cross` works — `sma-20` has a Point at the previous bar.
- **Consequence**: a new Pattern costs one Point dataclass, no Series subclass. Serialization
  is total, and Validation reads `since` where a Point declares one, falling back to `at`.
- **Cost**: no vectorized arithmetic over Series. Recoverable inside a Pattern (compute with
  numpy over Candles, pack Points at the end); only a real problem if a Pattern needs heavy
  numerics over *another* Pattern's output, which none does.
- **Cost**: an event detector cannot see its own past occurrences. Accepted — nothing survives
  a tick, so history would be recomputed noise.
- **Rejected**: a pandas DataFrame (heterogeneous payloads fall to `object` dtype) and a flat
  scalar array (fastest, but the wedge does not fit, and the wedge is the point). Also rejected:
  evaluating detectors over the whole window each tick, and a separate `Occurrence` output type —
  one currency is what lets Patterns consume each other.

## Amendment, 2026-08-12 — the Candle is the root of the Point hierarchy

Raised while building `packages/pattern_engine`: a Candle **already is** a Point, so a base
class above it whose only content is the anchor earns nothing.

- **The `Point` base class is dissolved into `Candle`.** `Candle` inherits from nothing and
  declares its own anchor, `time` — the instant the bar opened, UTC. `at` is gone as a field
  name everywhere.
- **A Pattern's Point subclasses `Candle`** and adds its payload. `BaseSeries[TPoint: Candle]`
  bisects `as_of` over `time`.
- **`Pivot` stays, now inheriting from `Candle`**: the bar of the vertex, plus `price` — which
  price on that bar is the vertex.
- `Candle.anchored(candle, **payload)` builds a Point on a bar, carrying the six Candle fields
  over, so packing a Point does not restate them.

**Consequence, and it is the whole of the trade:** an output Point now carries the OHLCV of
the bar it occurred on. Serialization to Validation and to the development UI gets the price
action of the anchor for free, without correlating back to the Candle Series — and in
exchange, a Point no longer separates what was measured from what was derived. `sma-20`'s
Point holds `value` **and** the bar's open/high/low/close/volume.

**Point remains a term** in the glossary — one element of a Series. It is simply no longer a
class of its own.

## Deliberately left out

- **Slicing a Series into another Series.** Returns if a Pattern needs to cut Candles between
  two Pivots.
- ~~**Aligning Series of different Timeframes.**~~ **Settled** in
  [#3](https://github.com/renatonmag/playbook/issues/3): there is no resampling policy anywhere.
  A Pattern that needs two Timeframes declares `reads=("1h","5m")` and correlates them itself;
  no component aligns Series on its behalf.
- ~~**Whether the producer in `identity` is a plain Pattern id or a parameterised key.**~~
  **Settled** in [#3](https://github.com/renatonmag/playbook/issues/3): a **parameterised key**,
  derived automatically from the class name plus the instance's parameters —
  `sma(period=20,emits=5m)`. Patterns are parameterised classes instantiated by hand, so two
  instances of one class must not collide.
