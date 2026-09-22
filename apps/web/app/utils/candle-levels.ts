import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { LevelSegment } from '~/utils/level-segments'

/**
 * A bar's four prices as levels that run from that bar to the current candle.
 *
 * Not a Pattern: nothing here comes off the pipeline, and there is no producer key. It reads the
 * candles the chart is already drawing, which is why it is the first thing on the monitor a person
 * points at with the cursor rather than turns on and waits for.
 *
 * The question it answers is "this bar stopped at a price — is that price still being respected?",
 * and it is asked of one bar at a time, which is what makes hover the right control for it and a
 * click the right way to keep one.
 *
 * It used to offer the ends of a bar's two wicks and nothing else, which meant a bar that closed on
 * its high offered no upper level at all: the wick had zero length, and a tool that draws where a
 * wick begins and ends has nothing to draw. But an open or a close is a price a person wants to ask
 * about whether or not a wick stands behind it — more so, if anything, on the bar that ran all the
 * way to its extreme. So the unit is the OHLC field now, and every bar has levels.
 */

/** Which of a bar's four prices a level sits at. */
export type OhlcField = 'open' | 'high' | 'low' | 'close'

/**
 * The order the fields are read, merged and listed in.
 *
 * OHLC, because that is the order the words come in everywhere else in this repo and in the data
 * itself. It is also what decides which field names a level whose prices coincide — see `levelsOf`.
 */
const FIELDS: readonly OhlcField[] = ['open', 'high', 'low', 'close']

export const LEVEL_LABELS: Record<OhlcField, string> = {
  open: 'abertura',
  high: 'máxima',
  low: 'mínima',
  close: 'fechamento',
}

/**
 * The hue each field is drawn in.
 *
 * Shared between the overlay and the sidebar's checkbox key, the reason `EXTREME_HUES` sits beside
 * its Pattern's segments rather than inside its component.
 *
 * Rose and indigo are the two this tool already used for the upper and lower wick, kept for the two
 * fields that were their ends. The other two had to be found clear of everything this chart draws at
 * a price: the page's four palette colours (`#2563eb`, `#c026d3`, `#ea580c`, `#0d9488`),
 * `EXTREME_HUES`' violet, cyan and lime, `BAR_HUES`' sky, amber, pink and grey, `GAP_HUES`' sky and
 * rose, and the candles' own green and red. Brown and near-black are what that leaves at this
 * weight, and they fall out sensibly: the close is the price most often read off a chart, and
 * near-black is the one hue that reads as a statement of fact rather than as a marking.
 */
export const LEVEL_HUES: Record<OhlcField, string> = {
  open: '#78350f',
  high: '#be123c',
  low: '#4338ca',
  close: '#1e293b',
}

/**
 * What a drawn level is called: the bar, and the field that names it.
 *
 * The bar's own `time`, so an id survives a window refetch and a live `update` — the same price may
 * be recomputed, but the bar it belongs to does not move. And the *field* rather than the price, for
 * the same reason: the forming bar's close moves with every tick, and a pin has to follow it rather
 * than stop resolving.
 *
 * The `level:` prefix is not decoration. Every primitive on the chart reports into one
 * `hoveredInfo.objectId` field, and `gapBoxId` mints a bare bar time — without the prefix a click
 * on a gap and a click on a level of the same bar would be the same string.
 */
export function candleLevelId(time: number, field: OhlcField): string {
  return `level:${time}:${field}`
}

/**
 * A drawn level, plus the fact a picture states in colour and position and a list has to state in
 * words. The primitive ignores it; the sidebar is why it is here — the same arrangement
 * `ExtremeSegment` makes.
 */
export interface CandleLevel extends LevelSegment {
  /**
   * Every OHLC field of this bar that lands on this price, in `FIELDS` order.
   *
   * Usually one. Several when they coincide — a bar that closed on its high has one line up there
   * and it is both the close and the high, and saying so is more honest than picking one of the two
   * names or drawing two lines on the same pixels.
   */
  fields: OhlcField[]
}

/** The bar a level id names, or `null` if the string is not one of ours. */
function timeOf(id: string): number | null {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== 'level') return null

  const time = Number(parts[1])
  return Number.isFinite(time) ? time : null
}

/**
 * One bar's levels, for the fields `kept` keeps.
 *
 * **Prices that coincide are one level.** A bar has four prices but not always four of them: a bar
 * that closed on its high has `close === high`, and two lines there would claim two things are being
 * respected where there is one, while also putting two overlapping hit targets on the same pixels —
 * of which only one could ever be clicked. So the fields are grouped by price, and a group is one
 * line that knows every name it goes by.
 *
 * **The grouping ignores `kept`, and the labelling does not.** Which fields share a price is a fact
 * about the bar, so the id a group mints — the first of its fields in `FIELDS` order — is the same
 * whatever the checkboxes say, and toggling a filter cannot renumber a pin out of existence. What
 * `kept` decides is whether the group is drawn at all, and which of its names the sidebar reads out:
 * the list is a legend for what is on the screen, so a line left standing by `máxima` while
 * `abertura` is unchecked is labelled `máxima`.
 *
 * Never empty, unlike the wick reading this replaces: every bar has an open and a close, so every
 * bar has at least one level and at least one thing to pin.
 */
function levelsOf(bar: Candle, kept: OhlcField[]): CandleLevel[] {
  const groups = new Map<number, OhlcField[]>()

  for (const field of FIELDS) {
    const price = bar[field]
    const group = groups.get(price)
    if (group) group.push(field)
    else groups.set(price, [field])
  }

  const levels: CandleLevel[] = []

  for (const [price, fields] of groups) {
    // The id's field, and the only thing taken from the group before `kept` is applied.
    const named = fields[0]
    if (named === undefined) continue

    const shown = fields.filter(field => kept.includes(field))
    const lead = shown[0]
    if (lead === undefined) continue

    levels.push({
      id: candleLevelId(bar.time, named),
      fields: shown,
      time: bar.time as UTCTimestamp,
      price,
      color: LEVEL_HUES[lead],
      // Always, unlike every other caller of this primitive. The stub length `LevelSegments` offers
      // answers "where was this found"; the question here is whether the price is still being
      // respected *now*, and that can only be read against the bars since.
      extend: true,
    })
  }

  return levels
}

/**
 * Every level to draw: the hovered bar's, plus those of the bars whose levels are pinned.
 *
 * Here rather than in the overlay because the sidebar lists the pinned ones in words — a level's
 * colour, the fields it stands for and its price — and reading those off a second traversal would be
 * two places deciding what a level is.
 *
 * The pinned ids are read back for their bar, which this module may do because they are its own
 * strings — see `candleLevelId`. Then filtered to exactly the ids asked for: a bar with a pinned
 * high has three other levels that were never pinned, and drawing those would make a pin mean "keep
 * this bar" rather than "keep this line".
 *
 * The hovered bar is drawn whole, and a bar that is both hovered and pinned is drawn once: the ids
 * are identical, and two fills in the same place are the same pixels, but the caller's `drawnIds`
 * would be a set of four where the list said eight.
 *
 * A pin is matched by the whole id, so on the **forming** bar a pinned level can go quiet for a
 * while: a close that ticks up onto its own high merges into that group, the group is named `high`,
 * and `level:<t>:close` names nothing until the close comes off the high again — at which point the
 * line is back. Left that way on purpose. It is the same silence a pin whose bar has scrolled out of
 * the window gets, the pin itself is never dropped, and the alternatives — drawing the merged line
 * twice under both ids, or drawing it under an id the page did not pin — each cost more than a
 * line that flickers on the one bar that is still being written.
 *
 * `kept` applies to both halves. A pinned level whose field is unchecked comes off the chart with
 * the rest — the filter is a thing the sidebar was asked to hide, and a click is not permission to
 * overrule it. That is the trade `pinnedSegments` states for `leg-extremes`.
 */
export function candleLevels(
  bars: ReadonlyMap<number, Candle>,
  hovered: number | null,
  pinned: ReadonlySet<string> = new Set(),
  kept: OhlcField[] = ['open', 'high', 'low', 'close'],
): CandleLevel[] {
  const levels: CandleLevel[] = []
  const seen = new Set<string>()

  const hoveredBar = hovered === null ? undefined : bars.get(hovered)
  if (hoveredBar) {
    for (const level of levelsOf(hoveredBar, kept)) {
      levels.push(level)
      seen.add(level.id)
    }
  }

  for (const id of pinned) {
    if (seen.has(id)) continue

    const time = timeOf(id)
    if (time === null) continue

    // A pin whose bar has scrolled out of the loaded window simply does not resolve — the honest
    // reading, and the one `pinnedSegments` gives for a leg that left.
    const bar = bars.get(time)
    if (!bar) continue

    for (const level of levelsOf(bar, kept)) {
      if (level.id !== id) continue
      levels.push(level)
      seen.add(level.id)
    }
  }

  return levels
}
