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

Decided so far. Everything here is design, not built — `packages/pattern_engine` does not
exist yet.

**The three moving parts**

- **`ScheduleLoop`** — decides when work happens. It wakes on a tick, works out which
  Patterns are due, and runs them.
- **`Store`** — unifies all data. Every Series is asked of the Store, never fetched by a
  Pattern. Because the Store sees each request as it arrives, it knows which Patterns feed
  which, and orders the run accordingly.
- **`BaseSeries`** — the base class every Series type inherits from. Candles are one
  subclass; a Pattern's output is another.

**How a Pattern works**

- **A Pattern is a class with `init` and `run()`.** `init` receives the Series the Pattern
  depends on, injected by the engine. `run()` reads what was injected and returns a Series.
- **The engine binds targets, the Pattern declares shape.** The universe of Instruments is
  engine configuration; each Pattern class declares which Timeframes it needs. A Pattern
  never names a ticker in its own code.
- **Patterns compose into a graph.** A Pattern may consume the Series produced by more
  primitive Patterns. The Store resolves the order.
- **Registration is manual for now.** Patterns are wired up in code by hand. Automatic
  discovery is a later concern.

**What a Series is made of**

Decided in [issue #2](https://github.com/renatonmag/playbook/issues/2); see ADR-0002.

- **A Series is a list of Points.** `BaseSeries[TPoint]` holds `list[TPoint]`, ordered by
  the Point's anchor. It is generic in the Point type and stores nothing else about shape.
- **`BaseSeries` is concrete — nothing is abstract.** A subclass only fixes the Point type.
  Writing a new Pattern costs one Point dataclass, not a Series subclass with abstract
  methods to fill in. Its whole surface: `identity`, `points`, `s[i]`, `len`/`iter`/`bool`
  (an empty Series is falsy — `if breakouts:` is the trigger test), and `to_dict()`.
- **A Point is frozen, and carries `at` and `since`.** `at` is the anchor — the Candle the
  Point belongs to. `since` is the Candle where the occurrence begins, equal to `at` when
  the occurrence is punctual. A wedge completing on bar 50 that started on bar 20 is one
  Point with `at` at bar 50 and `since` at bar 20. `since` exists because Validation has to
  know how much price action to send the LLM.
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
  what lets `ma-cross` read `sma-20` at the previous Candle. An event detector is evaluated
  **only at the current Candle** and produces at most one Point, anchored there. No detector
  sweeps the day looking for past occurrences: an occurrence that fired in an earlier tick is
  gone, and that is deliberate.

**Timing**

- **Scheduled, not continuous.** The base tick is every 5 minutes.
- **A Pattern runs when its Timeframe closes.** A Pattern that asks for `1h` or `1d`
  Candles runs only when that Candle closes — the engine reads the requested Timeframe and
  schedules accordingly, rather than running everything on every tick.
- **Trading hours come from a config file**, in `0900-1800` form.

**State and failure**

- **Every tick starts from zero.** Ticks are independent: memory is renewed on each run,
  nothing survives. So `run()` is idempotent, and no dedupe is needed — a tick has no
  history to repeat itself against.
- **A Pattern that raises stops the Patterns that depend on it**, and only those.

**Data**

- **Series are ordered by timestamp.** Gaps and timezone handling are deliberately ignored
  in this version.
- **The window is by day.** For intraday Timeframes, a Pattern receives every Candle of the
  current day at that Timeframe. For `1d`, `1w` and up, the Pattern states how many it
  wants.
- **Input behind a seam.** Candles come from Postgres on Supabase, via the Store. Patterns
  never query.
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
| **Point** | One element of a Series: a frozen record anchored at a Candle (`at`), spanning back to `since`, plus the payload its Pattern declares. An occurrence of a Pattern is a Point. | *detection*, *event*, *hit* |
| **Pivot** | A vertex a Pattern marks on the chart — a price at a Candle, high or low. The tops and bottoms of a wedge are Pivots. Shared across every geometric Pattern. | *top*, *bottom*, *swing* |
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
    └── pattern_engine/  # Python. ScheduleLoop, Store, BaseSeries, Patterns.
```

`packages/domain` holds the vocabulary above as types. Its pattern-detection code
(`Pattern.detect`, the `Detection` type) predates the decisions above and no longer matches
them — detection moved to `apps/detector` in Python, and Detection is no longer a term.

## Non-goals for v1

- No order execution. Playbook never places a trade.
- No financial advice framing. An Alert reports what was detected and why the LLM accepted
  it; the user decides.
- No push channels (Telegram, e-mail, WhatsApp). Alerts live in the UI.
