# ADR-0001 — Ingestion is decoupled from the platform via the database

- **Status**: Accepted
- **Date**: 2026-08-08

## Context

Playbook needs B3 market data — Candles for the Instruments users set Alarms on. Two shapes
were available: have the Nuxt app pull from the market data provider on demand, or run a
dedicated process that collects data and persists it, with the app reading only from
storage.

B3 market data is awkward to fetch on demand: providers rate-limit, the pregão has fixed
hours, and gaps have to be backfilled. Detection also needs a *Series* — a run of history,
not a single quote — so on-demand fetching would mean re-pulling the same window on every
evaluation.

## Decision

A separate **Ingestor** process owns all contact with the market data provider. It fetches
Candles and writes them to Postgres. Nothing else in the system talks to the provider.

The database is the contract between ingestion and everything downstream. Detection,
Validation, and the UI read Candles from Postgres and have no knowledge of where they came
from.

## Consequences

- The provider can be swapped without touching detection or the app. Given that the B3 data
  provider is not yet chosen, this keeps the decision cheap to defer and cheap to reverse.
- Detection is backtestable for free: historical Candles and live Candles arrive through the
  same table, so running a Pattern over history is the same code path as running it live.
- Ingestion failures degrade visibly rather than silently — stale Candles are detectable in
  the data, where a failed inline fetch would just look like "no Detections".
- Cost: two processes to deploy and a real database from day one, rather than a single Nuxt
  app. Accepted — the alternative pushes provider rate limits into the request path.
- Freshness is now bounded by ingestion cadence, not by request time. Timeframes below the
  ingestion interval are not meaningfully supported.

## Alternatives considered

- **Fetch on demand inside Nitro routes.** Simpler to deploy, but couples the app to the
  provider, makes rate limits a user-facing failure, and gives no path to backtesting.
- **Message queue between ingestion and detection.** Better fan-out and lower latency, but
  adds infrastructure before there is any evidence the database is the bottleneck. Revisit
  if detection needs to react within seconds of a Candle closing.
