import type { BarMark, LegBreak } from '~/types/pattern'
import { TURN_LABELS } from '~/utils/bars'

/**
 * The monitor's floating panel said out loud: one sentence about the leg in progress and the bar
 * that just closed.
 *
 * Everything in it is already on the wire and already on screen — `leg-breaks` and `bars` are two
 * of the Log's columns. What the Log cannot do is say them together: a reader after "how big was
 * the pullback, how busy was the leg, and what kind of bar just closed" reads three numbers out of
 * two tables and assembles the sentence in their head. This assembles it for them, and it is the
 * only place on the page where a Pattern's output is prose.
 *
 * **The two halves are anchored on different bars, deliberately.** `leg-breaks` anchors each Point
 * on the bar where its leg *reached* its extreme, which is almost never the newest bar — so the
 * leg happening now is the Series' last Point (the `provisional` one, while one is forming), not
 * a Point sitting at the bar's time. The bar half is the opposite: the marks whose `time` is the
 * last closed bar and no others. Reading both off one bar would leave the leg clause blank nearly
 * always, which is the reading a chart gives for free and the one nobody needs written down.
 *
 * **Kinds keep the engine's own words.** `two-bar` and `small-overlap` inside a Portuguese frame
 * looks like a lapse and is not: those strings are what the Log's rows, the sidebar's checkboxes
 * and `pipeline.py` all call them, and a reader checking this sentence against a row needs the two
 * to match letter for letter. `BAR_MARK_LABELS`' Portuguese is for the sidebar's column, where
 * there is no row to check against and no room for a hyphenated English name.
 *
 * **A clause with nothing to say disappears.** No measurable retracement, no marks on the bar, no
 * leg in the window — each drops its own clause, and nothing left drops the sentence. The
 * alternative is a line of em-dashes that reads as a broken panel rather than as a quiet bar.
 */

/** One mark, named: its kind, and its direction where it has one. */
export function markPhrase(mark: BarMark): string {
  // `null` is not an unknown direction — an inside bar and a smallest bar are claims about a
  // bar's range, and there is no side for them to be on. So the kind stands alone.
  if (mark.direction === null) return mark.type
  return `${mark.type} de ${TURN_LABELS[mark.direction]}`
}

/**
 * The sentence, or `null` when there is nothing to say.
 *
 * `marks` is expected to be one bar's worth — every mark the `bars` Pattern made on the last
 * closed bar, which can be several: the filters are a union, and the Forma rule can match one bar
 * for both turns. They are listed in the order the Pattern emitted them, which is its own fixed
 * order and not the alphabet.
 */
export function reading(leg: LegBreak | null, marks: BarMark[]): string | null {
  const clauses: string[] = []

  if (leg) {
    // In [0, 1] on the wire; a percentage is how a pullback is spoken about. Rounded rather than
    // fixed to a decimal: the number qualifies the leg, and a tenth of a percent qualifies nothing.
    if (leg.ratio !== null) clauses.push(`Perna com retração de ${Math.round(leg.ratio * 100)}%`)
    clauses.push(`${leg.legs} ${leg.legs === 1 ? 'perna interna' : 'pernas internas'}`)
  }

  if (marks.length > 0) {
    // `uma` only before a single kind: "é uma two-bar de alta" is the sentence, and "é uma two-bar
    // de alta, inside-bar" is not — with several kinds the article has nothing to agree with.
    const article = marks.length === 1 ? 'uma ' : ''
    clauses.push(`a barra atual é ${article}${marks.map(markPhrase).join(', ')}`)
  }

  if (clauses.length === 0) return null

  // The last clause joins with `e`, the rest with commas — the sentence in the request, and the
  // one a person would speak. A lone clause takes neither.
  const last = clauses[clauses.length - 1]!
  const rest = clauses.slice(0, -1)
  return rest.length === 0 ? last : `${rest.join(', ')} e ${last}`
}
