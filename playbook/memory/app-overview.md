# App Overview

A trading pattern management and session journaling tool. Users build a library of reusable trading patterns ("components") and then apply them to real trade sessions for analysis and review.

```mermaid
flowchart TD
    Lists["📋 Lists Route\n/lists\nPattern library overview"]
    Pattern["🔬 Pattern Route\n/pattern/:id\nEdit a single pattern"]
    Trade["📈 Trade Session Route\n/trade/:id\nJournal a trade session"]

    Lists -->|"Create new pattern"| Lists
    Lists -->|"Click pattern → edit"| Pattern
    Lists -->|"Open trade session"| Trade

    subgraph Pattern Detail
        P_Images["Add example images\n(image carousel)"]
        P_Category["Assign category\n(tag/group)"]
        P_Markdown["Write markdown docs\n(description & notes)"]
        P_Questions["Add decision questions\n(with answer → consequence links\nto other patterns)"]
    end

    Pattern --> P_Images
    Pattern --> P_Category
    Pattern --> P_Markdown
    Pattern --> P_Questions

    subgraph Trade Session
        T_SetupCard["Setup Card\n(groups concurrent scenarios)"]
        T_SubSetup["Sub-Setup\n(a single scenario within the card)"]
        T_Components["Add components\n(patterns from library)"]
        T_Details["Add details to component\n(child detail-kind patterns)"]
        T_Result["Tag result\nGain / Loss / Even / Flat"]
        T_Truth["Verdade (Truth) section\nWhat actually happened\n(components + details)"]
        T_Refs["Bar references\n(timeframe + bar range)"]
        T_MultiCard["Add another card\n(new independent scenario group)"]
    end

    Trade --> T_SetupCard
    T_SetupCard --> T_SubSetup
    T_SubSetup --> T_Components
    T_Components --> T_Details
    T_SubSetup --> T_Result
    T_SubSetup --> T_Truth
    T_Truth --> T_Details
    T_SubSetup --> T_Refs
    T_SetupCard --> T_MultiCard
```

## Route Summary

| Route | Purpose |
|---|---|
| `/lists` | Browse all patterns; create new ones; open trade sessions |
| `/pattern/:id` | Edit a pattern — images, category, markdown docs, questions |
| `/trade/:id` | Journal a trade — build setups from patterns, record outcome and truth |

## Key Concepts

- **Component / Pattern** — A named trading formation (e.g. "Bull Flag"). Can be `kind: "component"` (main) or `kind: "detail"` (sub-pattern used inside a main component).
- **Setup Card** — A container holding one or more sub-setups for the same trade event.
- **Sub-Setup** — One scenario within a card. Multiple sub-setups allow exploring "what if" alternatives concurrently.
- **Verdade (Truth)** — After the fact annotation: which patterns actually played out, independent of what was anticipated in the setup.
- **Bar Reference** — Anchors a sub-setup to a specific timeframe and bar range (e.g. `h1 b3..7`) for chart replay review.
- **Detail** — A child pattern attached to a component inside a setup, adding specificity (e.g. "Bull Flag" → "High Volume Breakout").
