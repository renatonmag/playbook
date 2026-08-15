/**
 * A candidate Forma rule, and whether it marks a Candle.
 *
 * Pure — no Vue, no fetch — because this is the arithmetic the whole bench rests on, and it has
 * to be readable next to the numbers it produces. It lives in the client rather than behind a
 * query parameter on `/shapes` deliberately: a route that took `wfMin` would put a detection
 * rule on the server with nothing naming it. See the docstring on `/patterns`.
 */

import { facing, type Direction, type Shape } from '~/types/shape'

/**
 * When a rule requires the body's colour to match the reversal.
 *
 * `acima-de` is the conditional form issue #10 described — colour only matters once the body is
 * big enough for open and close to be in different places. `sempre` is the strict reading. The
 * two are not close: inside a rule like `wf ≥ 0,4`, `wc ≤ 0,2` the conditional form barely
 * fires, because the body can rarely reach the threshold at all.
 */
export const COLOUR_MODES = ['sempre', 'acima-de', 'nunca'] as const

export type ColourMode = (typeof COLOUR_MODES)[number]

export interface Rule {
  name: string
  direction: Direction
  /**
   * The pre-filter issue #10 settled: the favourable shadow exists and beats the counter one.
   * A floor on `wf` can subsume it — `wf ≥ 0,5` with `wc ≤ 0,25` already implies `wf > wc` —
   * but the two are different claims and a rule may want either, so both are expressible.
   */
  requireWfOverWc: boolean
  /** `wf ≥` — the floor on the favourable shadow. */
  wfMin: number
  /** `wc ≤` — the ceiling on the counter shadow, as a fraction of the amplitude. */
  wcMax: number
  /**
   * `wc ≤ ratio × wf` — the counter shadow measured against the favourable one instead of
   * against the bar. A diagonal frontier rather than a flat one; `null` when unused. Applied on
   * top of `wcMax`, so a rule can state both and the tighter one wins.
   */
  wcMaxRatio: number | null
  bodyMin: number
  bodyMax: number
  colour: ColourMode
  /** Only read when `colour` is `acima-de`. */
  colourBodyMin: number
}

/** A rule that marks everything — the neutral starting point the editor opens on. */
export function emptyRule(): Rule {
  return {
    name: 'sem nome',
    direction: 'baixa',
    requireWfOverWc: false,
    wfMin: 0,
    wcMax: 1,
    wcMaxRatio: null,
    bodyMin: 0,
    bodyMax: 1,
    colour: 'nunca',
    colourBodyMin: 0.5,
  }
}

/** Whether the body's colour satisfies the rule. A bodyless Candle has no colour to disagree with. */
export function colourAgrees(rule: Rule, shape: Shape): boolean {
  if (rule.colour === 'nunca') return true
  if (rule.colour === 'acima-de' && shape.body <= rule.colourBodyMin) return true
  if (shape.body === 0) return true
  return rule.direction === 'baixa' ? shape.bear : !shape.bear
}

/** Whether this rule marks this Candle. */
export function marks(rule: Rule, shape: Shape): boolean {
  const [wf, wc] = facing(shape, rule.direction)
  if (rule.requireWfOverWc && !(wf > 0 && wf > wc)) return false
  if (wf < rule.wfMin || wc > rule.wcMax) return false
  if (rule.wcMaxRatio !== null && wc > rule.wcMaxRatio * wf) return false
  if (shape.body < rule.bodyMin || shape.body > rule.bodyMax) return false
  return colourAgrees(rule, shape)
}

/** The Candles a rule marks, in the order they were measured. */
export function marked(rule: Rule, shapes: Shape[]): Shape[] {
  return shapes.filter(shape => marks(rule, shape))
}

/** How two rules divide a set of Candles: what they share, and what only one of them claims. */
export function overlap(a: Rule, b: Rule, shapes: Shape[]) {
  let both = 0
  let onlyA = 0
  let onlyB = 0

  for (const shape of shapes) {
    const inA = marks(a, shape)
    const inB = marks(b, shape)
    if (inA && inB) both++
    else if (inA) onlyA++
    else if (inB) onlyB++
  }

  return { both, onlyA, onlyB }
}

/**
 * Whether two rules are the same rule, ignoring what they are called.
 *
 * The name is excluded on purpose: the question this answers is whether the rule *drifted* from
 * the one on disk, and a rule that only got renamed did not drift.
 */
export function sameRule(a: Rule, b: Rule): boolean {
  return a.direction === b.direction
    && a.requireWfOverWc === b.requireWfOverWc
    && a.wfMin === b.wfMin
    && a.wcMax === b.wcMax
    && a.wcMaxRatio === b.wcMaxRatio
    && a.bodyMin === b.bodyMin
    && a.bodyMax === b.bodyMax
    && a.colour === b.colour
    && a.colourBodyMin === b.colourBodyMin
}

/**
 * One entry of `docs/forma/rules.json`, normalised — and what it was missing.
 *
 * Same tolerance as `fromQuery`: an absent or unusable field falls back to `emptyRule`'s value,
 * so nothing downstream ever sees `undefined`. Unlike `fromQuery` it also **reports** what fell
 * back, because that file is written by hand and a missing field there is a typo, not a default.
 * Absorbing it silently is how a comparison table ends up showing confident wrong numbers.
 */
export function parseRule(value: unknown): { rule: Rule; missing: string[] } {
  const fallback = emptyRule()
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const missing: string[] = []

  const required = <T>(key: string, ok: boolean, parsed: T, or: T): T => {
    if (ok) return parsed
    missing.push(key)
    return or
  }

  const number = (key: string, or: number) => {
    const raw = source[key]
    return required(key, typeof raw === 'number' && Number.isFinite(raw), raw as number, or)
  }

  // `wcMaxRatio` is the one field whose absence is meaningful — `null` is "no proportional
  // frontier", a real setting — so it is the one field that is not reported as missing.
  const ratio = source.wcMaxRatio
  const wcMaxRatio = typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : null

  const rule: Rule = {
    name: required('name', typeof source.name === 'string' && source.name !== '', source.name as string, fallback.name),
    direction: required('direction', source.direction === 'baixa' || source.direction === 'alta', source.direction as Rule['direction'], fallback.direction),
    requireWfOverWc: required('requireWfOverWc', typeof source.requireWfOverWc === 'boolean', source.requireWfOverWc as boolean, fallback.requireWfOverWc),
    wfMin: number('wfMin', fallback.wfMin),
    wcMax: number('wcMax', fallback.wcMax),
    wcMaxRatio,
    bodyMin: number('bodyMin', fallback.bodyMin),
    bodyMax: number('bodyMax', fallback.bodyMax),
    colour: required('colour', COLOUR_MODES.includes(source.colour as ColourMode), source.colour as ColourMode, fallback.colour),
    colourBodyMin: number('colourBodyMin', fallback.colourBodyMin),
  }

  return { rule, missing }
}

/**
 * The rule as a compact query string, so a bench state is a shareable link.
 *
 * Only the fields that differ from `emptyRule` would be worth omitting, but writing all of them
 * keeps the URL readable and the parse total — a half-specified rule silently defaulting is the
 * kind of thing that makes two people compare different numbers under one link.
 */
export function toQuery(rule: Rule): Record<string, string> {
  return {
    name: rule.name,
    dir: rule.direction,
    pre: rule.requireWfOverWc ? '1' : '0',
    wf: String(rule.wfMin),
    wc: String(rule.wcMax),
    wcr: rule.wcMaxRatio === null ? '' : String(rule.wcMaxRatio),
    bmin: String(rule.bodyMin),
    bmax: String(rule.bodyMax),
    cor: rule.colour,
    corb: String(rule.colourBodyMin),
  }
}

/** The inverse of `toQuery`. Anything missing or unparseable falls back to the empty rule's value. */
export function fromQuery(query: Record<string, unknown>): Rule {
  const fallback = emptyRule()

  const number = (value: unknown, or: number) => {
    const parsed = Number(value)
    return typeof value === 'string' && value !== '' && !Number.isNaN(parsed) ? parsed : or
  }

  return {
    name: typeof query.name === 'string' && query.name ? query.name : fallback.name,
    direction: query.dir === 'alta' ? 'alta' : 'baixa',
    requireWfOverWc: query.pre === '1',
    wfMin: number(query.wf, fallback.wfMin),
    wcMax: number(query.wc, fallback.wcMax),
    wcMaxRatio: query.wcr === '' || query.wcr === undefined ? null : number(query.wcr, 0),
    bodyMin: number(query.bmin, fallback.bodyMin),
    bodyMax: number(query.bmax, fallback.bodyMax),
    colour: COLOUR_MODES.includes(query.cor as ColourMode) ? (query.cor as ColourMode) : fallback.colour,
    colourBodyMin: number(query.corb, fallback.colourBodyMin),
  }
}
