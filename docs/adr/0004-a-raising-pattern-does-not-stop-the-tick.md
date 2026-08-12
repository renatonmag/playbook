# ADR-0004 — A raising Pattern is logged and skipped; the tick carries on

- **Status**: Accepted
- **Date**: 2026-08-12
- **Constrains** [ADR-0002](0002-series-is-a-list-of-typed-points.md). Depends on the Pattern
  contract closed in [#3](https://github.com/renatonmag/playbook/issues/3).
- **Ticket**: [#5 — PatternEngine: o que acontece quando um Pattern estoura](https://github.com/renatonmag/playbook/issues/5)

## Context

`PatternEngine.run()` walks the declared list of Patterns in order and writes each output
into `ctx` under the Pattern's producer key. What it does when `pattern.run(ctx)` raises was
the last thing left open before the engine could be built.

`CONTEXT.md` already fixes the surrounding rules: asking `ctx` for a key it does not have
**raises**, never returns an empty Series, because "not produced yet" collapsing into "found
nothing" is the worst failure this system has. Order is declared by hand and resolved by
nobody, so nothing can check on the way up that a Pattern's inputs exist — decision 5 of #3
says a Pattern does not declare what it consumes.

## Decision

**The engine catches the exception, logs it with the producer key, writes nothing into
`ctx`, and moves to the next Pattern.** There is no failure marker and no end-of-tick report
— the log is the whole record.

A Pattern below that reads the missing key raises `KeyError`. That `KeyError` is itself
caught and logged the same way, so a failure propagates as a chain of log lines rather than
as an exception out of `run()`. `run()` returns the `ctx` it managed to fill.

## Consequences

- `run()` does not raise for a Pattern's own failure. A tick always completes.
- A downstream Pattern's error message names the **missing key**, not the original failure.
  The log is the only bridge between the two — the original traceback is one line above.
- **A mis-written pipeline order fails the same way**, and is discovered only in the log: the
  consumer runs first, raises `KeyError`, and is skipped. Nothing at startup catches it.
- "Failed" and "not produced" are indistinguishable **in `ctx`**, and distinguishable only in
  the log. This is the known cost, accepted on the grounds that the alternative — a marker
  under the key — taxes every reader forever to describe a case that should not happen.
- Output is still partial and still usable: the Patterns that did not depend on the failure
  produced their Series.

## Rejected

- **Abort the tick.** The failure would name itself precisely, but one broken Pattern would
  cost every unrelated Series in the run.
- **A failure marker in `ctx` under the producer key.** Keeps "failed" distinct from "not
  produced", and charges every reader with knowing the marker exists — a permanent tax on
  the common path for the uncommon one.
- **A check on the way up**, walking the list before running to confirm each Pattern's inputs
  were produced above it. Impossible without reopening #3 to make Patterns declare what they
  consume; the wrong order is discovered at run time instead.
- **An end-of-tick report** of which Patterns ran, failed, and produced. Nothing consumes it
  yet — output stays in memory in this version — and the log already carries it.
