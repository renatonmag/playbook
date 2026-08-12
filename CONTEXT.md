# Playbook — Context

## What this is

Playbook is an intelligent alarm system for the Brazilian stock market (B3). It watches
price series for technical patterns, sends each candidate to an LLM for validation, and
surfaces the ones that survive as alerts in the web UI.

The bet: pure pattern detection produces too many false positives to act on. An LLM given
the pattern, the surrounding price action, and the instrument's context can reject the
noise — turning a firehose into a short, reviewable list.

## Shape of the system

Four moving parts, deliberately decoupled through the database:

```
B3 market data ──> Ingestor ──> Postgres ──> Pattern engine ──> Web (Nuxt) ──> UI
                   (its own      (Supabase)  (Python,           validation
                    process)                  scheduled)
```

The **Ingestor** is a separate process with one job: fetch market data and persist it. It
does not detect, validate, or notify. Everything downstream reads from the database and
never calls the market data provider directly. This is the load-bearing boundary of the
system — see ADR-0001.

The **pattern engine** is a Python process that runs pattern detection on a schedule. It
lives in `packages/pattern_engine`. Python was chosen for its data ecosystem (pandas,
numpy). It replaces the pure-TypeScript detection that `packages/domain` was originally
going to hold.

## The detection engine

`packages/pattern_engine` now holds the skeleton: `Candle`, `Pivot`, `BaseSeries`,
`Pattern` and `PatternEngine`. No market Pattern is written yet, and nothing reads Supabase.

**The moving parts**

- **The pipeline is declared in code.** Which Patterns run, and in what order, is written out
  by hand — as a list of Pattern instances handed to `PatternEngine`. **There is no Pattern
  scheduling** — nothing works out which Patterns are due, and nothing infers dependencies.
  Declaration order is run order. There is no dependency graph.
- **One `PatternEngine` per Instrument.** A tick walks the universe and builds a throwaway
  engine per ticker. No Pattern sees two Instruments — see ADR-0003.
- **`ctx`** — the dict that unifies all data for one run. It starts with the Candles handed to
  the constructor under `bars` and the ticker under `instrument` — the two keys that are not
  producer keys — and each Pattern's output is written into it under the
  Pattern's producer key. It is a **memo table for one pass, not a cache**: discarded when the
  run ends, never made to persist — that would reintroduce the state independent runs exist to
  forbid. Because the engine is per-Instrument, `ctx` is keyed by **producer alone**; the
  Instrument and Timeframe of the `identity` live on the Series itself.
- **`BaseSeries`** — the one container every Series is, generic in the type of Point it holds.
  A Series of Candles is the base case; a Pattern's output is a Series of that Pattern's own
  Point type.

**Asking `ctx` for something it does not have raises.** It never returns an empty Series as a
stand-in. Empty already has a meaning — the Pattern ran and found nothing — and collapsing
"not produced yet" into it would turn a mis-written order into a silently missing alert, which
is the worst failure this system has. In code: `ctx[key]`, never `ctx.get(key, empty)`.

**How a Pattern works**

Decided in [issue #3](https://github.com/renatonmag/playbook/issues/3).

- **A Pattern is a parameterised class, instantiated by hand in the pipeline list.**
  `PatternEngine(bars, [EngulfingPattern(emits="5m"), Sma(period=20, emits="5m")])`. Two
  instances of one class are two Patterns.
- **The producer is a parameterised key**, derived automatically from the class name plus the
  instance's parameters — `sma(period=20,emits=5m)`, not a plain `sma`. Without it, two
  instances of a class collide on one `ctx` key and the second silently overwrites the first.
- **`init` takes parameters, not Series.** Nothing is injected. `run(ctx)` reads what it needs
  straight out of `ctx` and returns one Series, which the engine writes under the producer key.
  A Pattern may also write into `ctx` itself; nothing forbids it.
- **A Pattern declares `reads` and `emits` separately.** `reads` is the set of Timeframes whose
  Candles it looks at; `emits` is the single Timeframe its output Series belongs to.
  `WedgeConfirmed(reads=("1h","5m"), emits="1h")`. This is what lets one Pattern be
  multi-timeframe without `identity` or `Point` changing — see ADR-0003.
- **`reads` carries no minimum bar count**, and nothing verifies the Candles handed in are
  enough. Deliberate for now; the cost is that too few Candles produce an empty Series
  indistinguishable from "found nothing".
- **The engine binds targets, the Pattern declares shape.** The universe of Instruments is
  engine configuration. A Pattern never names a ticker in its own code.
- **Patterns compose in sequence.** A Pattern may consume the Series produced by more
  primitive Patterns, by asking `ctx` for their producer key. The order is declared, not
  resolved — see above.
- **The detection method is the Pattern's own business.** Hand-written rule, TA-Lib, a trained
  classifier, or an LLM reading the chart — all pack Points at the end of `run`, and the
  contract does not distinguish them. Known cost: the engine is synchronous and serial, so a
  Pattern that calls the network stalls the whole tick.
- **Registration is manual for now.** Patterns are wired up in code by hand. Automatic
  discovery is a later concern.

**What a Series is made of**

Decided in [issue #2](https://github.com/renatonmag/playbook/issues/2); see ADR-0002.

- **A Series is a list of Points.** `BaseSeries[TPoint]` holds `list[TPoint]`, ordered by
  the Point's anchor. It is generic in the Point type and stores nothing else about shape.
- **`BaseSeries` is concrete — nothing is abstract.** A subclass only fixes the Point type.
  Writing a new Pattern costs one Point dataclass, not a Series subclass with abstract
  methods to fill in. Its whole surface: `identity`, `points`, `s[i]`, `len`/`iter`/`bool`
  (an empty Series is falsy — `if breakouts:` is the trigger test), `as_of(t)`, and
  `to_dict()`.
- **`as_of(t) -> TPoint | None`** answers "which Point was in effect at time `t`?" — the last
  Point whose `time` is at or before `t`. It is a bisect over a list already ordered by `time`, so
  O(log n), and it is the whole of what a Series offers for correlating with another Series.
  It carries no policy: no resampling, no forward-filling into a finer grid. Being a search
  rather than index arithmetic, it is tolerant of gaps by construction.
- **A Point is a Candle.** There is no Point base class: `Candle` is the root — frozen, with
  `time` (the instant the bar opened, UTC) plus OHLCV — and a Pattern's Point subclasses it,
  adding its payload. So a Point does not *reference* its anchor bar, it *is* that bar, with
  more on top. `Pivot` is one such subclass, shared by every geometric Pattern: the bar of the
  vertex plus which price on it is the vertex. `Candle.anchored(bar, **payload)` is how a
  Pattern packs one without restating the six inherited fields. Extent is not part of the
  contract, because most occurrences are punctual and have nothing to say about it. The cost:
  every output Point carries the OHLCV of its bar, so nothing in a Point separates what was
  measured from what was derived — see ADR-0002's 2026-08-12 amendment.
- **Extended Patterns declare `since` on their own Point subclass.** The base Point class
  carries a comment saying so: a Pattern whose occurrence spans several Candles should
  declare a `since` attribute — the Candle where the occurrence begins — in its own payload.
  A wedge completing on bar 50 that started on bar 20 is one Point with `time` at bar 50 and
  `since` at bar 20. It lives on the subclass rather than the base because only some
  Patterns are extended; Validation reads it, when present, to know how much price action to
  send the LLM.
- **The payload is declared by the subclass.** `sma-20` declares `value`; a wedge declares
  its Pivots and geometry. Methods on a Point are allowed, and are the right way for a
  downstream Pattern to ask questions (`upper_line_at`, `height`) — but a method is
  **derivation, never state**. Everything must be computable from the attributes, because a
  Point gets serialized to Validation and to the development UI, and what lives only in
  behaviour does not survive that trip.
- **A Series knows who it is.** `identity` is `(producer, instrument, timeframe)`, where
  producer is the Pattern that made it or `candles` for the base case. It lives on the
  object, not only in the Store's key, so an injected Series is self-describing, failures
  name what was being produced, and serialized output carries its provenance.
- **How much of the window gets filled depends on the Pattern.** An indicator is a
  continuous function of the Candles and has a Point at every Candle of the window — that is
  what lets `ma-cross` read `sma-20` at the previous Candle. 

**Timing**

- **Patterns are not scheduled.** There is no per-Pattern due-ness: a run executes the
  declared pipeline from top to bottom, and a Pattern asking for `1h` or `1d` is not held
  back until that Candle closes. What triggers a run at all is still open.
- **Trading hours come from a config file**, in `0900-1800` form.

**State and failure**

- **Every tick starts from zero.** Ticks are independent: memory is renewed on each run,
  nothing survives. So `run()` is idempotent, and no dedupe is needed — a tick has no
  history to repeat itself against.
- **A raising Pattern stops nothing.** The engine logs the failure with the producer key,
  writes nothing into `ctx`, and moves to the next Pattern — see ADR-0004. A Pattern below
  that reads the missing key raises `KeyError`, which is caught and logged the same way, so a
  failure travels as a chain of log lines and never leaves `run()`. There is no failure
  marker and no end-of-tick report. The cost: "failed" and "not produced" are the same thing
  in `ctx`, and a mis-written pipeline order is discovered only in the log.

**Data**

- **Series are ordered by timestamp.** Gaps and timezone handling are deliberately ignored
  in this version.
- **The window is by day.** For intraday Timeframes, a Pattern receives every Candle of the
  current day at that Timeframe. For `1d`, `1w` and up, the Pattern states how many it
  wants.
- **The engine fetches nothing.** Candles are read from Postgres on Supabase *outside* the
  engine and handed to the constructor as `bars` — `{"5m": <BaseSeries of Candles>, ...}`. For
  now that dict is assembled by hand, in a script or the REPL. Candles arrive as a
  `BaseSeries`, never as raw rows or a DataFrame, so the database's shape never reaches a
  detection rule. `bars` stays a separate entry rather than Series under the normal key scheme,
  so a Pattern has two modes of reading: `ctx["bars"][tf]` for Candles, `ctx[producer]` for
  another Pattern's output.
- **Output stays in memory** for this version.

### Out of scope for this effort

The Ingestor, the choice of B3 data provider, and seeding Supabase with real Candles are
separate work. This effort fixes only the **read contract** for Candles — which fields
detection needs, how a Series is requested, ordering — not the DDL, indexes, or
partitioning. Validation by the LLM and the production UI are downstream of it.

The TypeScript detection code in `packages/domain` stays as it is for now, contradiction
and all.

### Open

- Dissolving Detection (below) removed the marker for which outputs are candidates for
  Validation. A Series of moving averages and a Series of breakouts now look alike to
  whatever reads the engine's output. How an alertable Series is distinguished from
  intermediate plumbing is deliberately deferred.
- A development UI will exist, for looking at what the engine produced. Its shape is not
  decided.

## Glossary

Code identifiers are English; this table is the authority on which word means what. Where a
term has a tempting synonym, the synonym is listed as *avoid* — don't drift to it.

| Term | Meaning | Avoid |
|---|---|---|
| **Instrument** | A tradable thing on B3, identified by its ticker (`PETR4`, `WINFUT`). | *asset*, *stock*, *paper* |
| **Candle** | One OHLCV bar for an Instrument at a Timeframe. The atomic unit of price data. | *bar*, *tick* |
| **Timeframe** | The bar interval a Candle covers (`5m`, `15m`, `1h`, `1d`). | *period*, *resolution* |
| **Series** | An ordered, Candle-aligned run of values for one Instrument + Timeframe. Candles are the base case; a Pattern's output is also a Series — of breakouts, of wedges, of moving-average values. Series is the single currency the engine passes around. | *history*, *chart* |
| **Point** | One element of a Series: a Candle (`time` plus OHLCV) extended with the payload its Pattern declares — which, for an extended Pattern, includes a `since` marking where the occurrence begins. An occurrence of a Pattern is a Point. A term, not a class: `Candle` is the root. | *detection*, *event*, *hit* |
| **Pivot** | A vertex a Pattern marks on the chart — the Candle of the vertex plus which price on it is the vertex, high or low. The tops and bottoms of a wedge are Pivots. Shared across every geometric Pattern. | *top*, *bottom*, *swing* |
| **Pattern** | A named, reusable rule (e.g. `inside-bar`) that reads one or more Series and produces a Series. A definition, never an occurrence. | *setup*, *strategy* |
| **Validation** | The LLM's verdict on a candidate: accepted or rejected, plus its reasoning. | *analysis*, *review* |
| **Signal** | A candidate whose Validation accepted it. This is the only thing the system considers actionable. | *trade*, *entry*, *call* |
| **Alarm** | A user-configured standing rule: watch Instrument X at Timeframe Y for Pattern Z. Persists until the user removes it. | *subscription*, *watch* |
| **Alert** | What the user actually sees: a Signal that matched one of their Alarms. | *notification*, *alarm* |

**Detection is no longer a term.** It used to mean one occurrence of a Pattern at a
specific Candle, distinct from Series. That distinction is gone: a Pattern's output is a
Series like any other, which is what lets Patterns consume each other. An occurrence is
just a **Point** in an output Series.

The distinction that matters most: **Alarm** is what the user sets up; **Alert** is what
they receive; **Signal** is the validated market event that connects them. A Signal with no
matching Alarm produces no Alert.

**Series → Validation → Signal → Alert** is the pipeline, in that order. Naming that
collapses two of these stages (`detectAndValidate`, `signalDetector`) is a smell.

## Repo layout

```
playbook/
├── CONTEXT.md
├── docs/adr/
├── apps/
│   ├── web/          # Nuxt 4 — UI + Nitro API. Reads the DB.
│   └── ingestor/     # market data collection process. Writes the DB.
└── packages/
    ├── domain/          # Instrument/Candle/Pattern types
    └── pattern_engine/  # Python. ScheduleLoop, PatternEngine, BaseSeries, Patterns.
```

`packages/domain` holds the vocabulary above as types. Its pattern-detection code
(`Pattern.detect`, the `Detection` type) predates the decisions above and no longer matches
them — detection moved to `apps/detector` in Python, and Detection is no longer a term.

## Non-goals for v1

- No order execution. Playbook never places a trade.
- No financial advice framing. An Alert reports what was detected and why the LLM accepted
  it; the user decides.
- No push channels (Telegram, e-mail, WhatsApp). Alerts live in the UI.
