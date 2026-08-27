import type { LegPoint } from '~/types/pattern'

/**
 * The hue each of a leg's three levels is drawn in — violet, cyan, lime.
 *
 * Shared between the overlay that draws the segments and the key beside the sidebar's checkbox,
 * which is the whole reason it is here rather than a `const` in the component.
 * `LegReversalsOverlay` keeps its own table and `LegReversalsVerify` restates it by hand, held
 * together by a comment; that is survivable for two lists of dots read side by side and is not
 * survivable for a colour *key*, which is a claim about what the picture means.
 *
 * Chosen clear of everything else already on the monitor: the page's four palette colours, the
 * candles' green and red, and `LegReversalsOverlay`'s sky, amber and pink.
 */
export const EXTREME_HUES: Record<LegPoint['type'], string> = {
  reach: '#7c3aed',
  close: '#0891b2',
  hold: '#65a30d',
}

/**
 * What each level is, in words, for that key.
 *
 * Direction-neutral, like the `type` values themselves: on a bull leg these are the highest high,
 * the highest close and the highest low, and on a bear leg each is the mirror. A label naming the
 * OHLC field would be wrong on half the legs on screen.
 */
export const EXTREME_LABELS: Record<LegPoint['type'], string> = {
  reach: 'extremo',
  close: 'fechamento',
  hold: 'sustentado',
}
