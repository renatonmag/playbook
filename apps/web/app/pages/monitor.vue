<script setup lang="ts">
import type { Component } from 'vue'
import { isTimeframe, SECONDS, TIMEFRAMES, type Timeframe } from '~/types/candle'
import { producerName, type BarGap, type LegExtremes, type PatternPoint, type TrendLine } from '~/types/pattern'
import { COLOUR_MODES, parseRule, PIPELINE_RULE, sameRule, type Rule } from '~/utils/rule'
import ZigZagOverlay from '~/components/ZigZagOverlay.vue'
import SimpleLegOverlay from '~/components/SimpleLegOverlay.vue'
import LegReversalsOverlay from '~/components/LegReversalsOverlay.vue'
import LegExtremesOverlay from '~/components/LegExtremesOverlay.vue'
import BarGapOverlay from '~/components/BarGapOverlay.vue'
import GeneralDirectionOverlay from '~/components/GeneralDirectionOverlay.vue'
import TrendLinesOverlay from '~/components/TrendLinesOverlay.vue'
import { Badge } from '~/components/ui/badge'

/**
 * Until instruments are a table, the picker offers what the database is known to hold.
 * Today that is the mini index future only, and only on `5m` and `1h` — the other two
 * timeframes render the empty state, which is the honest answer.
 */
const SYMBOLS = ['WIN@N'] as const

const DEFAULT_SYMBOL = 'WIN@N'
const DEFAULT_TIMEFRAME: Timeframe = '5m'

/**
 * Which component draws which Pattern, keyed by the producer's class part — `zig-zag`, without
 * its parameters, so two zigzags at different depths share one renderer.
 *
 * This registry is the bet that Patterns differ in *how* they are drawn, not only in their data.
 * If every overlay ends up being "a line plus markers", it should collapse into one data-driven
 * component and this map should go.
 *
 * The second entry is the first test of that bet, and it held: `simple-leg` is a line with no
 * markers, because its Points carry no second bar to mark. What the two overlays share is the
 * line, and that went to `useLineOverlay` rather than into this map.
 *
 * The third is the other half of the same test: `leg-reversals` is markers with no line, and its
 * dots are coloured by a field of the Point rather than by this file's palette. Between them the
 * three cover line-only, markers-only, and both — which is the case for keeping the map.
 *
 * The fourth settles it: `leg-extremes` is a canvas **series primitive**, because a level with a
 * length is neither a marker nor a line series. It shares no drawing code with the other three at
 * all, so the "one data-driven component" the bet was hedging against is now off the table.
 *
 * The fifth, `bar-gap`, is a primitive too — a filled region, which is not a level either — and it
 * is the first to share a drawing with an existing entry: `LevelBoxes` takes its time-axis
 * arithmetic from `LevelSegments`. That sharing happens between the two utils, not here, which is
 * the shape this map was hoping for.
 *
 * The seventh, `trend-lines`, is the third primitive and the first **sloped** drawing — the one
 * shape none of the six above could be talked into, since a level, a band and a line series are all
 * horizontal or one-value-per-time. It is also the first primitive to draw in the *Series'* palette
 * colour rather than a per-point hue, which is a claim about the picture rather than a shortcut:
 * see `trendSegments`.
 */
const OVERLAYS: Record<string, Component> = {
  'zig-zag': ZigZagOverlay,
  'simple-leg': SimpleLegOverlay,
  'leg-reversals': LegReversalsOverlay,
  'leg-extremes': LegExtremesOverlay,
  'bar-gap': BarGapOverlay,
  // Markers-only again, like `leg-reversals`, but drawn in the palette colour: a turn of the
  // general direction carries no per-type hue to protect, only a side.
  'general-direction': GeneralDirectionOverlay,
  'trend-lines': TrendLinesOverlay,
}

/** Enough hues to tell overlapping Series apart; reused cyclically beyond that. */
const COLORS = ['#2563eb', '#c026d3', '#ea580c', '#0d9488']

const route = useRoute()
const router = useRouter()

// The URL is the source of truth, so a monitor view is shareable and survives a reload.
const symbol = computed(() => {
  const value = route.query.symbol
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : DEFAULT_SYMBOL
})

const timeframe = computed<Timeframe>(() => {
  const value = route.query.timeframe
  return isTimeframe(value) ? value : DEFAULT_TIMEFRAME
})

/**
 * Where the window ends, or `null` for the live edge.
 *
 * Absence is what means "now", so a link without `to` always shows the present while a link with
 * it shows exactly what the person who copied it saw. An unparseable value falls back to live
 * rather than erroring, the same silent fallback `symbol` and `timeframe` make.
 */
const at = computed<string | null>(() => {
  const value = route.query.to
  if (typeof value !== 'string') return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
})

/** Names the window for Nuxt's cache. From the URL, not from the resolved `to` — see `useCandles`. */
const windowKey = computed(() => at.value ?? 'now')

function select(patch: { symbol?: string, timeframe?: string, to?: string }) {
  router.replace({
    // `undefined` drops the key from the URL, which is how the window goes back to live.
    query: { symbol: symbol.value, timeframe: timeframe.value, to: at.value ?? undefined, ...patch },
  })
}

/**
 * `datetime-local` speaks local wall time with no offset, the URL and the routes speak ISO with
 * one. `toISOString()` cannot format the input's value — it converts to UTC, and the field would
 * show an hour the user never picked.
 */
function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pin(value: string) {
  // Empty means the field was cleared: back to live.
  if (!value) return select({ to: undefined })
  // `new Date` reads an offsetless string as local time — what was typed — and `Z` is mandatory,
  // since the routes answer 400 for a naive datetime.
  select({ to: new Date(value).toISOString() })
}

/**
 * The Forma rule the pipeline should apply to `leg-reversals`, kept in `localStorage`.
 *
 * This is the one thing on this page the server does not decide. It is here rather than on
 * `/rules` because the bench judges `/shapes` in the browser and this Pattern cannot be judged
 * that way — it reads the leg's internals, which never cross the wire — so the numbers travel
 * instead. See the module docstring on `/patterns`.
 */
const { rule, update: updateRule, reset: resetRule } = useStoredRule()

/** Whether the numbers differ from what the pipeline runs unattended. */
const adjusted = computed(() => !sameRule(rule.value, PIPELINE_RULE))

// The window the chart opens with, and the only one `/candles` ever asks for: after this fetch
// the socket owns the right-hand edge. See `useWindow` for why there are now two of these.
const window = useWindow(timeframe, at)

const { data: candles, pending, error, refresh } = useCandles(symbol, timeframe, window, windowKey)
/**
 * The live edge, held open only while "Agora" is on.
 *
 * Separate from `useCandles` on purpose: that fetch owns the window the chart opens with, and
 * this socket owns everything after it. The two meet at the chart, which draws the window with
 * `setData` and each live bar with `update`.
 */
const live = useLiveCandles(symbol, timeframe)

/**
 * How many bars the feed has opened since the page loaded, seeded from the loaded window's last
 * bar so the socket's first frame is a baseline rather than news.
 */
const bar = useBarClock(live.bars, () => candles.value?.at(-1)?.time ?? null)

/**
 * A bar time is only comparable within one Instrument and Timeframe. Switching either leaves a
 * high-water mark set by the old feed, and `5m` bars arriving under an `1h` mark would each read
 * as old news — the pipeline would quietly stop re-running. The seed moves with the refetch.
 */
watch([symbol, timeframe], () => bar.reset())

/**
 * A pinned window and a live feed contradict each other — one says "these bars, frozen", the
 * other keeps appending. Pinning wins, because it is the more specific request.
 */
watch(at, (value) => {
  if (value) live.disconnect()
})

/** "Agora" does both jobs: back to the live window, and on/off for the feed. */
function goLive() {
  // Unpinning first, so the refetch and the socket agree about which bars are on screen.
  if (at.value) select({ to: undefined })
  live.toggle()
}

/**
 * The window the pipeline runs over, which advances as bars open while the chart's does not.
 *
 * `windowKey` is deliberately not given the epoch: its job is to name the request identically on
 * the server and the client (see `usePatterns`), and what re-runs the fetch is the changed query,
 * not a changed key. A bump landing mid-run is handled by `useFetch`'s default `dedupe: 'cancel'`.
 */
const runWindow = useWindow(timeframe, at, bar.epoch)

const {
  data: patterns,
  error: patternsError,
  // Named, unlike on `/candles`, because a rule edit now starts a pipeline run: without this the
  // sidebar shows the previous rule's counts with nothing saying they are about to change.
  pending: patternsPending,
} = usePatterns(runWindow, windowKey, rule)

/**
 * The rules committed to `docs/forma/rules.json`, so the ones already worth comparing against are
 * a click rather than seven fields of typing. The same fetch and the same `parseRule` the bench
 * uses — it is the same file, and a second reading of it could disagree with the first.
 */
const { data: saved } = useFetch<{ rules: unknown[] }>('/api/rules', { default: () => ({ rules: [] }) })

const savedRules = computed(() => (saved.value?.rules ?? []).map(parseRule).map(entry => entry.rule))

/**
 * Loads a saved rule's **numbers**. Its name stays behind, and that is not an oversight.
 *
 * `/patterns` names every override `K` so the producer key never moves, which is what lets the
 * chip above survive an edit. Carrying `J` into the sidebar would put a name on screen that
 * nothing in the response agrees with.
 */
function loadSaved(name: string) {
  const found = savedRules.value.find(entry => entry.name === name)
  if (!found) return
  // `name` and `direction` are deliberately not copied: the route refuses both.
  const { name: _name, direction: _direction, ...numbers } = found
  updateRule(numbers)
}

/** `null` clears the proportional frontier; the field is left empty to mean "unused". */
function setRatio(value: string) {
  updateRule({ wcMaxRatio: value === '' ? null : Number(value) })
}

/**
 * The body range, clamped so the two ends cannot cross.
 *
 * On the bench a crossed range is merely a rule that marks nothing, and you see that immediately
 * in the counts. Here it is a **400** from `rule_query` — a request that fails rather than one
 * that answers zero — so dragging `bmin` past `bmax` would flash an error banner mid-edit. The
 * clamp keeps the invariant on this side of the wire, where it costs one line.
 */
function setBody(edge: 'bodyMin' | 'bodyMax', value: string) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return
  updateRule(edge === 'bodyMin'
    ? { bodyMin: Math.min(parsed, rule.value.bodyMax) }
    : { bodyMax: Math.max(parsed, rule.value.bodyMin) })
}

/** The number fields in the rule block. Narrower than the bench's — this is a 20rem sidebar. */
const ruleField = 'w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs'

/**
 * Every Series the pipeline produced, in a shape the checkbox list and the overlays share.
 *
 * Series of *any* timeframe are listed, including ones the chart is not showing. Marking one of
 * those is allowed and will distort the candle spacing, because the chart's time scale is the
 * union of its series' times — a known and accepted trade.
 */
const overlays = computed(() =>
  Object.entries(patterns.value?.series ?? {}).map(([producer, series], index) => ({
    producer,
    // The class part, kept alongside the component: the sidebar needs to name the Pattern to know
    // whether it has extra controls, and re-splitting the key in the template would hide that.
    name: producerName(producer),
    // What the *Pattern* calls itself, which is what the sidebar shows. Deliberately a second
    // field rather than a better `name`: the one above is a lookup key into `OVERLAYS` and the
    // three sets below it, and a label that reads well would break every one of them.
    label: series.name,
    component: OVERLAYS[producerName(producer)],
    // Left as the base Point: each Pattern declares its own, and this list holds all of them.
    // The overlay a producer maps to is the thing that knows which one it is getting, and it
    // narrows in its own props.
    points: series.points as PatternPoint[],
    timeframe: series.identity.timeframe,
    color: COLORS[index % COLORS.length]!,
  }))
    // Series with no entry in `OVERLAYS` are dropped rather than sorted last, which is what the
    // chips cost: a chip is a control that opens a control, and one that opens an empty panel is
    // worse than an absent one. The trade is worth stating plainly — a producer the pipeline emits
    // before this page has an overlay for it is the normal order of work, not an error, and it now
    // appears nowhere on this page. `failed` below does not cover it, because it did not fail.
    //
    // After the `map`, so the palette is still handed out in the response's order: a Series keeps
    // its colour whether or not an undrawable one came before it.
    .filter(overlay => overlay.component),
)

/**
 * Drawn producers. Held as the exception rather than the rule so a Series arriving for the
 * first time is hidden by default, and the chart opens as candles alone however many Patterns
 * the pipeline gains.
 *
 * Local, not in the URL: the producer key carries the timeframe, so it changes as you switch
 * timeframes and would not survive in a link anyway.
 */
const shown = ref(new Set<string>())

function toggle(producer: string) {
  if (shown.value.has(producer)) shown.value.delete(producer)
  else shown.value.add(producer)
}

/**
 * Producers whose control block is unfolded under the chips.
 *
 * Deliberately not `shown`: a chip opens the controls of a Pattern, and `Mostrar` inside them is
 * what reaches the chart. One checkbox used to answer both questions, which meant you could not
 * read a Series' filters without drawing it, or leave it drawn without its controls in the way.
 *
 * The exception again, and for the reason `shown` is one: the column opens as chips alone.
 */
const open = ref(new Set<string>())

function toggleOpen(producer: string) {
  if (open.value.has(producer)) open.value.delete(producer)
  else open.value.add(producer)
}

/**
 * The two ways a leg can run, in the order the filters are listed, with the label each gets.
 *
 * This is the one place the page knows a Point-level field of a specific Pattern. What it does
 * with it is narrow — pass the kept directions down — and the overlay still owns what a direction
 * *means* for the drawing: dots above or below the bar on one, which levels to draw on the other.
 */
const DIRECTIONS = [
  { value: 'bullish', label: 'bull' },
  { value: 'bearish', label: 'bear' },
] as const

type Direction = typeof DIRECTIONS[number]['value']

/**
 * The Patterns whose Points carry a `direction`, and so get the bull/bear filter under them.
 *
 * A set rather than the condition written out at each of the three places that ask — the props
 * spread, the checkboxes, the colour key. Those fell out of step the moment a second Pattern
 * qualified, and the failure is quiet: filter checkboxes that render while nothing reads them.
 */
const DIRECTIONAL = new Set(['leg-reversals', 'leg-extremes', 'bar-gap'])

/**
 * The Patterns whose overlay draws clickable things, and so get the pin machinery: the auto-hide
 * switch, the `pinned`/`onlyPinned` props, and the list of what survives the timer.
 *
 * A set for the same reason `DIRECTIONAL` is one — the condition is asked in four places, and they
 * fell out of step the moment a second Pattern qualified. What each entry pins is its own business:
 * `leg-extremes` pins one of a leg's three levels, `bar-gap` pins a whole band, `trend-lines` pins
 * — *selects*, in that Pattern's words — one line, which then runs on to the current candle.
 */
const PINNABLE = new Set(['leg-extremes', 'bar-gap', 'trend-lines'])

/**
 * The two states a gap can be in, in the order the filters are listed, with the label each gets.
 *
 * `bar-gap`'s second filter axis, and the only Pattern with one — which is why the places that ask
 * write `overlay.name === 'bar-gap'` out rather than consulting a set. `DIRECTIONAL` and
 * `PINNABLE` are sets because three and four places ask them and those fell out of step; this is
 * asked in two. Promote it the moment a second Pattern qualifies.
 */
const STATES = [
  { value: 'open', label: 'aberto' },
  { value: 'closed', label: 'fechado' },
] as const

type State = typeof STATES[number]['value']

/**
 * States the open/closed filters have turned *off*, keyed by producer and state.
 *
 * The exception again, as with `hiddenDirections`: a Series you chose to show arrives with both
 * states drawn, and unchecking is the deliberate act worth storing.
 */
const hiddenStates = ref(new Set<string>())

function stateKey(producer: string, state: State) {
  return `${producer}:${state}`
}

function statesFor(producer: string): State[] {
  return STATES.map(item => item.value).filter(
    value => !hiddenStates.value.has(stateKey(producer, value)),
  )
}

function toggleState(producer: string, state: State) {
  const key = stateKey(producer, state)
  if (hiddenStates.value.has(key)) hiddenStates.value.delete(key)
  else hiddenStates.value.add(key)
}

/**
 * The two sides a trend line can run along, in the order the filters are listed, with the label
 * each gets.
 *
 * `trend-lines`' own axis, and the third distinct one on this page. Deliberately not `DIRECTIONS`:
 * that names a *move* — which way a leg or a gap ran — and this names an *extreme*. A ceiling drawn
 * along the tops is not a bearish line, and one row of checkboxes answering both questions would
 * say otherwise. The labels come from `TREND_LABELS`, which the pinned list below also reads, so
 * the filter and the list cannot end up calling one side two different things.
 *
 * Written out at each place that asks, like `STATES` and for its stated reason: two Patterns with
 * two axes is not yet the drift a set exists to prevent. Promote both the moment a third qualifies.
 */
const SIDES = [
  { value: 'high', label: TREND_LABELS.high },
  { value: 'low', label: TREND_LABELS.low },
] as const

/**
 * Sides the top/bottom filters have turned *off*, keyed by producer and side.
 *
 * The exception again, as with `hiddenStates` and `hiddenDirections`: a Series you chose to show
 * arrives with both sides drawn, and unchecking is the deliberate act worth storing.
 */
const hiddenSides = ref(new Set<string>())

function sideKey(producer: string, side: TrendSide) {
  return `${producer}:${side}`
}

function sidesFor(producer: string): TrendSide[] {
  return SIDES.map(item => item.value).filter(
    value => !hiddenSides.value.has(sideKey(producer, value)),
  )
}

function toggleSide(producer: string, side: TrendSide) {
  const key = sideKey(producer, side)
  if (hiddenSides.value.has(key)) hiddenSides.value.delete(key)
  else hiddenSides.value.add(key)
}

/**
 * Directions the bull/bear filters have turned *off*, keyed by producer and direction.
 *
 * The exception again, as with `shown`, but inverted: a Series arrives hidden, while a Series you
 * chose to show arrives with both its directions drawn. Unchecking is the deliberate act, so it is
 * the thing worth storing.
 */
const hiddenDirections = ref(new Set<string>())

function directionKey(producer: string, direction: Direction) {
  return `${producer}:${direction}`
}

function directionsFor(producer: string): Direction[] {
  return DIRECTIONS.map(item => item.value).filter(
    value => !hiddenDirections.value.has(directionKey(producer, value)),
  )
}

function toggleDirection(producer: string, direction: Direction) {
  const key = directionKey(producer, direction)
  if (hiddenDirections.value.has(key)) hiddenDirections.value.delete(key)
  else hiddenDirections.value.add(key)
}

/**
 * Producers whose levels should fade out between bars, keyed the same way `shown` is.
 *
 * Off by default and stored as the exception, for the third time on this page: a Series you turned
 * on is a Series you want to see, and asking for it to go away again is the deliberate act.
 */
const autoHide = ref(new Set<string>())

/**
 * One timer for the whole page, not one per producer.
 *
 * Every Series is measured by the same bar clock, so per-producer timers would be several copies of
 * one countdown all firing on the same tick. What is per-producer is only whether a Series *listens*
 * to it, which is `autoHide` above.
 */
const hideTimer = useHideTimer(bar.epoch, () => autoHide.value.size > 0)

function toggleAutoHide(producer: string) {
  if (autoHide.value.has(producer)) autoHide.value.delete(producer)
  else {
    autoHide.value.add(producer)
    // Turning it on means "get out of the way", so it goes now rather than in half a minute. The
    // timer takes over at the next bar, which is the only moment it was ever measuring.
    hideTimer.hide()
  }
}

/**
 * Levels somebody clicked on the chart, keyed `producer|segmentId` — the same two-part key
 * `directionKey` makes, and for the same reason: one Series' pins must not read as another's.
 *
 * These are what survives the hide timer. A pin is *not* a fourth filter: unchecking the Series or
 * one of its directions still hides a pinned level, because those are things the sidebar was asked
 * to hide and a click on a line is not permission to overrule them.
 *
 * Keyed on the leg and the level's role — see `extremeSegmentId` — so a pin follows its leg
 * through a pipeline re-run rather than being frozen to a price. A leg that leaves the window
 * takes its pins off the list with it, and that is the honest reading: there is no such level any
 * more.
 *
 * A `leg-extremes` segment now names its producer inside its id as well, so its key here repeats
 * it. Left alone rather than special-cased: the prefix is what makes this key uniform across every
 * pinnable Pattern, and `bar-gap`'s ids carry no producer at all.
 */
const pinned = ref(new Set<string>())

function pinKey(producer: string, segment: string) {
  return `${producer}|${segment}`
}

function togglePin(producer: string, segment: string) {
  const key = pinKey(producer, segment)
  if (pinned.value.has(key)) pinned.value.delete(key)
  else pinned.value.add(key)
}

/** The bare segment ids for one Series, which is what its overlay speaks. */
function pinsFor(producer: string): string[] {
  const prefix = `${producer}|`
  return [...pinned.value].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
}

function clearPins(producer: string) {
  for (const key of pinsFor(producer)) pinned.value.delete(pinKey(producer, key))
}

/**
 * The pinned levels of one Series as things with a colour, a role and a price — what the list under
 * the checkbox shows.
 *
 * Resolved against the *current* response through the same `extremeSegments` the overlay draws
 * from, so the list and the chart cannot disagree, and a pin whose leg is gone simply does not
 * resolve. `directions` is applied there too, which is why a level hidden by the bull/bear filter
 * drops out of the list as well as off the chart — it is not on screen, and the list is a legend
 * for what is.
 */
function pinnedSegments(overlay: { producer: string, points: PatternPoint[] }): ExtremeSegment[] {
  const ids = new Set(pinsFor(overlay.producer))
  if (ids.size === 0) return []

  return extremeSegments(
    // The same namespace the overlay draws under, so the list and the chart name one level the
    // same thing. `extraProps` is where the other half of that is passed.
    overlay.producer,
    overlay.points as LegExtremes[],
    directionsFor(overlay.producer),
    ids,
  ).filter(segment => ids.has(segment.id))
}

/**
 * The same thing for `bar-gap`, through `gapBoxes` — its overlay's own shaping function.
 *
 * A separate function rather than a branch inside `pinnedSegments`, because the two return
 * different things: a level has a role and one price, a gap has a direction, a state and two
 * edges, and the lists in the sidebar say different words about them. What they share is this
 * page's pin bookkeeping, which is `pinsFor` and `togglePin` and is already shared.
 *
 * Both filters are passed, for the reason `pinnedSegments` passes the one it has: a gap hidden by
 * a checkbox is not on screen, and the list is a legend for what is.
 */
function pinnedGaps(overlay: { producer: string, points: PatternPoint[] }): GapBox[] {
  const ids = new Set(pinsFor(overlay.producer))
  if (ids.size === 0) return []

  return gapBoxes(
    overlay.points as BarGap[],
    directionsFor(overlay.producer),
    statesFor(overlay.producer),
    ids,
  ).filter(box => ids.has(box.id))
}

/**
 * The same thing for `trend-lines`, through `trendSegments` — its overlay's own shaping function.
 *
 * A third function rather than a third branch, for the reason there is already a second: a line is
 * named by its side and read as two prices at two bars, where a gap is two prices at one and a
 * level is one price at one. The lists in the sidebar say different words about all three.
 *
 * It needs the Series' colour, which neither of the two above do — the swatch in this list is the
 * line's actual colour, because for this Pattern the palette colour *is* what gets drawn.
 */
function pinnedTrends(overlay: { producer: string, points: PatternPoint[], color: string }): DrawnTrend[] {
  const ids = new Set(pinsFor(overlay.producer))
  if (ids.size === 0) return []

  return trendSegments(
    overlay.points as TrendLine[],
    sidesFor(overlay.producer),
    overlay.color,
    ids,
  ).filter(segment => ids.has(segment.id))
}

/**
 * A bar time as a clock reading.
 *
 * `timeZone: 'UTC'` is what makes the hour come out right in São Paulo, and is *not* a decision to
 * display UTC: the stored epoch encodes São Paulo wall time labelled as UTC. The docblock on
 * `pages/record-bars.vue` sets this out in full; without it every label here reads three hours
 * early. One function rather than one per caller, because that reasoning does not survive being
 * retyped.
 *
 * Unix seconds, so `* 1000`.
 */
function barLabel(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The bar the last pipeline run reached — one behind `bar.last`, always.
 *
 * `/patterns` withholds the newest bar the feed has written, because that is the one still being
 * rewritten. `bar.last` *is* that bar, so the run reached the one before it. Naming `bar.last`
 * here would claim a run over a bar the server explicitly refused, and make the one-bar gap at
 * the right edge read as a stall.
 *
 * No clock is consulted, deliberately, and none can be: the server's rule is "a later bar
 * exists", and a wall-clock test here would be worse than useless because bar times are not on
 * the wall clock's scale — see `barLabel`.
 *
 * Client-only by where it is rendered — `bar.last` is seeded from the fetch and moved by the
 * socket, and the server has neither.
 */
const lastBarLabel = computed(() => {
  if (bar.last.value === null) return null
  return barLabel(bar.last.value - SECONDS[timeframe.value])
})

/**
 * The props only one overlay takes, spread into the `component` so the others never see them —
 * an unknown attribute would fall through onto components that render no root element.
 */
function extraProps(overlay: { producer: string, name: string }) {
  return {
    ...DIRECTIONAL.has(overlay.name) ? { directions: directionsFor(overlay.producer) } : {},
    // The second filter axis, and `bar-gap`'s alone — see `STATES`.
    ...overlay.name === 'bar-gap' ? { states: statesFor(overlay.producer) } : {},
    // The third, and `trend-lines`' alone — tops or bottoms, which is not the bull/bear question
    // above however much the two rows look alike. See `SIDES`.
    ...overlay.name === 'trend-lines' ? { sides: sidesFor(overlay.producer) } : {},
    // What this Series calls its segments. `leg-extremes` alone, because it is the only Pattern
    // the pipeline runs twice — over the zigzag's leg windows and over the advancing legs — and
    // two Series minting one id would have each pinning the other's levels.
    ...overlay.name === 'leg-extremes' ? { namespace: overlay.producer } : {},
    ...PINNABLE.has(overlay.name)
      ? {
          pinned: pinsFor(overlay.producer),
          // The timer no longer decides whether the Series draws, only how much of it: a Series
          // whose countdown has fired keeps whatever was pinned. See `isVisible`.
          onlyPinned: autoHide.value.has(overlay.producer) && hideTimer.hidden.value,
          onPin: (segment: string) => togglePin(overlay.producer, segment),
        }
      : {},
  }
}

/**
 * Whether a Series is drawn right now, which is the `Mostrar` button and nothing else.
 *
 * The hide timer used to be the second half of this and is not any more: with pins it decides
 * *which* segments a `leg-extremes` Series draws rather than whether it draws at all, and that is
 * a question only the overlay can answer — it is the thing that knows what a segment is. It gets
 * the timer's state as `onlyPinned`, from `extraProps`.
 */
function isVisible(overlay: { producer: string }) {
  return shown.value.has(overlay.producer)
}
</script>

<template>
  <!-- A workspace rather than an article, so it takes the whole window instead of the centred
       column the other pages use: the chart is worth every pixel of width, and a fixed-height one
       wastes the bottom of a tall screen.

       `lg:h-screen`, not `h-screen`: below that breakpoint the area below is a column with the
       sidebar stacked under the chart, and pinning both to the viewport would squeeze each into
       half a screen. There the page scrolls, as it always did. -->
  <main class="flex flex-col lg:h-screen">
    <!-- Padded while the area below is not: this is text, and text against the window edge reads
         as a bug. `shrink-0` so the row below can never compress it. -->
    <header class="flex shrink-0 flex-wrap items-end justify-between gap-4 p-4">
      <div>
        <h1 class="text-2xl font-bold">Monitor</h1>
        <!-- Says which of the two the view is, so a shared link that is frozen in the past does
             not read as a live chart that stopped updating. -->
        <p class="mt-1 text-sm text-gray-500">
          {{ symbol }} · {{ timeframe }} ·
          <span v-if="at" class="text-amber-600">janela fixada</span>
          <span v-else>ao vivo</span>
          <!-- The socket exists only in the browser, so its state must not be rendered on the
               server — same reason the timepicker below is wrapped. -->
          <ClientOnly>
            <span v-if="live.status.value === 'open'" class="text-green-600">&nbsp;· conectado</span>
            <span v-else-if="live.status.value === 'connecting'" class="text-gray-400">&nbsp;· conectando…</span>
            <span v-else-if="live.status.value === 'error'" class="text-red-600">&nbsp;· {{ live.error.value }}</span>
          </ClientOnly>
        </p>
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm">
          <span class="mr-2 text-gray-500">Ativo</span>
          <select
            class="rounded border border-gray-300 px-2 py-1"
            :value="symbol"
            @change="select({ symbol: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="option in SYMBOLS" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <label class="text-sm">
          <span class="mr-2 text-gray-500">Timeframe</span>
          <select
            class="rounded border border-gray-300 px-2 py-1"
            :value="timeframe"
            @change="select({ timeframe: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="option in TIMEFRAMES" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <!-- The field reads local wall time, which the server may not share; rendering it only on
             the client keeps that difference from surfacing as a hydration mismatch. -->
        <ClientOnly>
          <label class="text-sm">
            <span class="mr-2 text-gray-500">Até</span>
            <input
              type="datetime-local"
              class="rounded border border-gray-300 px-2 py-1"
              :value="at ? toLocalInput(at) : ''"
              @change="pin(($event.target as HTMLInputElement).value)"
            >
          </label>
          <template #fallback>
            <div class="h-[34px] w-56" />
          </template>
        </ClientOnly>

        <!-- Always present now, because it is a switch rather than an escape hatch: with
             `v-if="at"` there was no way back to a live feed once you were already unpinned. -->
        <ClientOnly>
          <button
            class="rounded border px-3 py-1 text-sm"
            :class="live.connected.value
              ? 'border-green-600 bg-green-50 text-green-700'
              : 'border-gray-300'"
            @click="goLive()"
          >
            Agora
            <span v-if="live.connected.value" class="ml-1 text-xs">■</span>
          </button>
          <template #fallback>
            <div class="h-[34px] w-20" />
          </template>
        </ClientOnly>
      </div>
    </header>

    <!-- The gap and the top margin are gone on purpose: that space *was* the frame around this
         area, and there is no frame any more. `lg:flex-1` takes everything under the header, and
         `lg:min-h-0` is the load-bearing half — without it a flex child refuses to shrink below
         its content and the sidebar's overflow lands on the page instead of inside the panel. -->
    <div class="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      <!-- `border-y` alone: flush with the window, so a left or right border would be drawn on
           the screen edge and the corner radius has nothing to sit on. The seam between the two
           panels is the sidebar's `lg:border-l`.

           No height here: `flex-1` is `flex: 1 1 0%`, and in the column this becomes below `lg`
           that basis would beat any `h-*` written on this tag. The height goes on the chart
           inside, where nothing overrides it. -->
      <section class="min-w-0 flex-1 overflow-hidden border-y border-gray-200">
        <p v-if="pending" class="p-8 text-center text-sm text-gray-500">
          Carregando candles…
        </p>

        <div v-else-if="error" class="p-8 text-center text-sm">
          <p class="text-red-600">Não foi possível carregar os candles.</p>
          <p class="mt-1 font-mono text-xs text-gray-500">{{ error.message }}</p>
          <button class="mt-3 rounded border border-gray-300 px-3 py-1 text-sm" @click="refresh()">
            Tentar de novo
          </button>
        </div>

        <p v-else-if="!candles?.length" class="p-8 text-center text-sm text-gray-500">
          Nenhum candle para {{ symbol }} · {{ timeframe }} nesta janela.
        </p>

        <ClientOnly v-else>
          <!-- `CandleChart` has no height of its own — the box is the caller's to state. At `lg`
               that is whatever the row gives this section; stacked below it, it is the 520px the
               page has always shown. -->
          <CandleChart class="h-[520px] lg:h-full" :candles="candles" :live-bars="live.bars.value">
            <component
              :is="overlay.component"
              v-for="overlay in overlays"
              :key="overlay.producer"
              :points="overlay.points"
              :color="overlay.color"
              :visible="isVisible(overlay)"
              v-bind="extraProps(overlay)"
            />
          </CandleChart>
          <template #fallback>
            <div class="h-[520px] w-full lg:h-full" />
          </template>
        </ClientOnly>
      </section>

      <!-- A sidebar full of unfolded filters scrolls inside itself rather than pushing the chart
           off screen. No height is named here any more: the row states one, and this panel takes
           whatever it gives — which is why `lg:min-h-0` up there is not optional.

           Only at `lg`, for the reason the row is only a row there: stacked under the chart, a
           nested scroll area is worse than the page scroll it would replace. -->
      <aside class="w-full shrink-0 border-y border-gray-200 p-4 lg:w-80 lg:overflow-y-auto lg:border-l">
        <h2 class="flex items-baseline justify-between text-sm font-semibold">
          Padrões
          <!-- The run is now started by editing a field, so it needs to say it is running. -->
          <span v-if="patternsPending" class="text-xs font-normal text-gray-400">rodando…</span>
        </h2>

        <!-- The run is now unattended, so the page has to say when it last happened: overlays
             that stop moving because the feed died look exactly like ones with nothing to draw. -->
        <ClientOnly>
          <p v-if="live.status.value === 'open'" class="mt-1 text-xs text-gray-500">
            Recalculados a cada candle fechado<span v-if="lastBarLabel"> · último: {{ lastBarLabel }}</span>
          </p>
        </ClientOnly>

        <p v-if="patternsError" class="mt-3 text-xs text-red-600">
          Não foi possível rodar o pipeline.
          <span class="block font-mono text-gray-500">{{ patternsError.message }}</span>
        </p>

        <p v-else-if="!overlays.length" class="mt-3 text-xs text-gray-500">
          Nenhum padrão desenhável nesta janela.
        </p>

        <!-- A chip per Pattern, and under them the control block of whichever chips are on. The
             chip itself draws nothing — it opens and closes the control — and `Mostrar` inside the
             control is what reaches the chart. Those are two facts about one Pattern, and the
             checkbox this replaced had to stand for both at once. -->
        <div v-else>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <!-- `as="button"` so a chip is focusable and answers the keyboard: it is a control, and
                 its variant is the only thing on screen saying which controls are open. -->
            <Badge
              v-for="overlay in overlays"
              :key="overlay.producer"
              as="button"
              :variant="open.has(overlay.producer) ? 'default' : 'secondary'"
              :title="overlay.producer"
              @click="toggleOpen(overlay.producer)"
            >
              <!-- Lit in the Series' palette colour while it is drawn and hollow while it is not,
                   so a folded control still says whether its Pattern is on the chart. Always
                   rendered: a dot that appeared would resize the chip under the cursor. -->
              <span
                class="size-1.5 shrink-0 rounded-full border"
                :style="shown.has(overlay.producer)
                  ? { backgroundColor: overlay.color, borderColor: overlay.color }
                  : { backgroundColor: 'transparent', borderColor: 'currentColor', opacity: 0.4 }"
              />
              {{ overlay.label }}
            </Badge>
          </div>

          <!-- `v-for` and `v-if` cannot share an element, and the condition is per-Pattern. -->
          <template v-for="overlay in overlays" :key="overlay.producer">
            <div v-if="open.has(overlay.producer)" class="mt-3 border-t border-gray-200 pt-3">
              <div class="flex items-baseline justify-between gap-2 text-xs">
                <!-- The name the Pattern gives itself. The producer key is not gone — it is the
                     chip's tooltip, which is where a total, unique, unreadable string belongs. -->
                <span class="min-w-0 truncate font-medium" :style="{ color: overlay.color }">
                  {{ overlay.label }}
                </span>
                <span class="shrink-0 text-gray-500">{{ overlay.points.length }} pontos</span>
              </div>

              <p v-if="overlay.timeframe !== timeframe" class="mt-0.5 text-xs text-amber-600">
                {{ overlay.timeframe }}, fora do timeframe exibido
              </p>

              <!-- What the checkbox used to be, and the only control here that reaches the chart. -->
              <button
                class="mt-1.5 rounded border px-2 py-0.5 text-xs"
                :class="shown.has(overlay.producer)
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-gray-300 text-gray-500'"
                @click="toggle(overlay.producer)"
              >
                {{ shown.has(overlay.producer) ? 'Ocultar' : 'Mostrar' }}
              </button>

              <!-- Only under a Series that is actually drawn: with `Mostrar` off there is nothing
                   for these to filter, and leaving them visible would suggest otherwise. -->
              <div
                v-if="DIRECTIONAL.has(overlay.name) && shown.has(overlay.producer)"
                class="mt-1 flex gap-3"
              >
                <label
                  v-for="direction in DIRECTIONS"
                  :key="direction.value"
                  class="flex items-center gap-1 text-xs text-gray-500"
                >
                  <input
                    type="checkbox"
                    :checked="!hiddenDirections.has(`${overlay.producer}:${direction.value}`)"
                    @change="toggleDirection(overlay.producer, direction.value)"
                  >
                  {{ direction.label }}
                </label>
              </div>

              <!-- `bar-gap`'s second axis. Same shape as the row above and deliberately not folded
                   into it: bull/bear is a property of the move that made the gap, open/closed is a
                   property of everything that happened since, and one row of four checkboxes would
                   read as one question with four answers. -->
              <div
                v-if="overlay.name === 'bar-gap' && shown.has(overlay.producer)"
                class="mt-1 flex gap-3"
              >
                <label
                  v-for="state in STATES"
                  :key="state.value"
                  class="flex items-center gap-1 text-xs text-gray-500"
                >
                  <input
                    type="checkbox"
                    :checked="!hiddenStates.has(`${overlay.producer}:${state.value}`)"
                    @change="toggleState(overlay.producer, state.value)"
                  >
                  {{ state.label }}
                </label>
              </div>

              <!-- `trend-lines`' only filter. Same shape as the two rows above and a different
                   question again: not which way the move ran, but which extreme the line is drawn
                   along. It is the one control this Series needs — there is no colour key, because
                   every line it draws is the Series' own colour, which the chip's dot
                   already shows. -->
              <div
                v-if="overlay.name === 'trend-lines' && shown.has(overlay.producer)"
                class="mt-1 flex gap-3"
              >
                <label
                  v-for="side in SIDES"
                  :key="side.value"
                  class="flex items-center gap-1 text-xs text-gray-500"
                >
                  <input
                    type="checkbox"
                    :checked="!hiddenSides.has(`${overlay.producer}:${side.value}`)"
                    @change="toggleSide(overlay.producer, side.value)"
                  >
                  {{ side.label }}
                </label>
              </div>

              <!-- Red and blue are now a claim about what the picture means, so the key that the
                   three levels needed this one needs too. The swatch is a filled square because the
                   thing it stands for is a filled region, not a line. -->
              <div
                v-if="overlay.name === 'bar-gap' && shown.has(overlay.producer)"
                class="mt-1 flex flex-wrap gap-x-3 gap-y-1"
              >
                <span
                  v-for="(hue, state) in GAP_HUES"
                  :key="state"
                  class="flex items-center gap-1 text-xs text-gray-500"
                >
                  <span class="inline-block h-2 w-3 border" :style="{ borderColor: hue, backgroundColor: hue + '40' }" />
                  {{ GAP_STATE_LABELS[state] }}
                </span>
              </div>

              <!-- The three levels are told apart by colour alone, and the dot on the chip above is
                   the *Series'* palette colour, which this overlay ignores. Without a key
                   the picture cannot be read at all. `leg-reversals` colours its dots the same way
                   and has no key either; that is left as it is rather than quietly widened here. -->
              <div
                v-if="overlay.name === 'leg-extremes' && shown.has(overlay.producer)"
                class="mt-1 flex flex-wrap gap-x-3 gap-y-1"
              >
                <span
                  v-for="(hue, type) in EXTREME_HUES"
                  :key="type"
                  class="flex items-center gap-1 text-xs text-gray-500"
                >
                  <span class="inline-block h-0.5 w-3" :style="{ backgroundColor: hue }" />
                  {{ EXTREME_LABELS[type] }}
                </span>
              </div>

              <!-- The levels bury the candles a few legs in, and they are worth most right after a
                   leg closes. This trades them for the price action in between: on, they clear the
                   chart at once and come back for half a minute after each new candle.

                   `ClientOnly` because the state word is decided by a timer, which only exists in
                   the browser — the same reason the feed's status above is wrapped. -->
              <div
                v-if="PINNABLE.has(overlay.name) && shown.has(overlay.producer)"
                class="mt-1"
              >
                <ClientOnly>
                  <button
                    class="rounded border px-2 py-0.5 text-xs"
                    :class="autoHide.has(overlay.producer)
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 text-gray-500'"
                    @click="toggleAutoHide(overlay.producer)"
                  >
                    Ocultar entre candles
                    <!-- The state word alone: "oculto" is not the whole truth with a pin held — the
                         Series is hidden *except* for it — but the list below ("Fixados",
                         "Selecionadas") is where that reads properly. Saying it here too made the
                         button wrap in a 20rem sidebar. -->
                    <span v-if="autoHide.has(overlay.producer)" class="ml-1 text-gray-500">
                      · {{ hideTimer.hidden.value ? 'oculto' : 'visível' }}
                    </span>
                  </button>
                  <template #fallback>
                    <div class="h-[24px] w-32" />
                  </template>
                </ClientOnly>
              </div>

              <!-- What survives the timer, and the only place a pinned level can be read as words:
                   on the chart it is a slightly thicker line among many.

                   `ClientOnly` because a pin only exists after a click, and because the count beside
                   the switch above is decided by a timer the server does not have. -->
              <ClientOnly>
                <div
                  v-if="overlay.name === 'leg-extremes' && shown.has(overlay.producer)"
                  class="mt-1 text-xs"
                >
                  <div v-if="pinnedSegments(overlay).length" class="flex items-baseline justify-between gap-2">
                    <span class="text-gray-500">Fixados</span>
                    <button class="text-gray-400 hover:text-gray-600" @click="clearPins(overlay.producer)">
                      limpar
                    </button>
                  </div>
                  <p v-else class="text-gray-400">
                    Clique numa linha do gráfico para mantê-la visível.
                  </p>

                  <ul class="mt-1 space-y-0.5">
                    <li
                      v-for="segment in pinnedSegments(overlay)"
                      :key="segment.id"
                      class="flex items-center gap-1.5 text-gray-500"
                    >
                      <span class="inline-block h-0.5 w-3 shrink-0" :style="{ backgroundColor: segment.color }" />
                      <span>{{ EXTREME_LABELS[segment.type] }}</span>
                      <span class="font-mono">{{ segment.price }}</span>
                      <span class="text-gray-400">{{ barLabel(segment.time) }}</span>
                      <button
                        class="ml-auto text-gray-400 hover:text-gray-600"
                        :aria-label="`desafixar ${EXTREME_LABELS[segment.type]}`"
                        @click="togglePin(overlay.producer, segment.id)"
                      >
                        ✕
                      </button>
                    </li>
                  </ul>
                </div>

                <!-- The same list for `bar-gap`, written out rather than folded into the one above:
                     a gap is named by its direction and read as two prices, where a level is named
                     by its role and read as one. Sharing the markup would mean a row of conditional
                     cells saying nothing about either. -->
                <div
                  v-if="overlay.name === 'bar-gap' && shown.has(overlay.producer)"
                  class="mt-1 text-xs"
                >
                  <div v-if="pinnedGaps(overlay).length" class="flex items-baseline justify-between gap-2">
                    <span class="text-gray-500">Fixados</span>
                    <button class="text-gray-400 hover:text-gray-600" @click="clearPins(overlay.producer)">
                      limpar
                    </button>
                  </div>
                  <p v-else class="text-gray-400">
                    Clique num gap do gráfico para mantê-lo visível.
                  </p>

                  <ul class="mt-1 space-y-0.5">
                    <li
                      v-for="box in pinnedGaps(overlay)"
                      :key="box.id"
                      class="flex items-center gap-1.5 text-gray-500"
                    >
                      <span class="inline-block h-2 w-3 shrink-0 border" :style="{ borderColor: box.color, backgroundColor: box.color + '40' }" />
                      <span>{{ GAP_LABELS[box.direction] }}</span>
                      <span class="font-mono">{{ box.bottom }}–{{ box.top }}</span>
                      <span class="text-gray-400">{{ barLabel(box.time) }}</span>
                      <!-- The state in words as well as in colour, and for a closed gap the bar that
                           closed it: on the chart that bar is nowhere, since the box does not reach
                           it. -->
                      <span class="text-gray-400">
                        {{ GAP_STATE_LABELS[box.state] }}<template v-if="box.closedAt"> {{ barLabel(box.closedAt) }}</template>
                      </span>
                      <button
                        class="ml-auto text-gray-400 hover:text-gray-600"
                        :aria-label="`desafixar ${GAP_LABELS[box.direction]}`"
                        @click="togglePin(overlay.producer, box.id)"
                      >
                        ✕
                      </button>
                    </li>
                  </ul>
                </div>
                <!-- And the same list once more for `trend-lines`, written out for the reason the
                     one above it is: a line is named by its side and read as two prices at two
                     times, which is a third row shape rather than a variant of either. The swatch
                     is a short diagonal stroke — the only one of the three lists whose swatch is the
                     colour actually on the chart, since this Pattern draws in the Series' hue. -->
                <div
                  v-if="overlay.name === 'trend-lines' && shown.has(overlay.producer)"
                  class="mt-1 text-xs"
                >
                  <div v-if="pinnedTrends(overlay).length" class="flex items-baseline justify-between gap-2">
                    <span class="text-gray-500">Selecionadas</span>
                    <button class="text-gray-400 hover:text-gray-600" @click="clearPins(overlay.producer)">
                      limpar
                    </button>
                  </div>
                  <p v-else class="text-gray-400">
                    Clique numa linha do gráfico para estendê-la até o candle atual.
                  </p>

                  <ul class="mt-1 space-y-0.5">
                    <li
                      v-for="segment in pinnedTrends(overlay)"
                      :key="segment.id"
                      class="flex items-center gap-1.5 text-gray-500"
                    >
                      <span
                        class="inline-block h-2 w-3 shrink-0 border-b"
                        :style="{ borderColor: segment.color, transform: 'skewY(-20deg)' }"
                      />
                      <span>{{ TREND_LABELS[segment.side] }}</span>
                      <span class="font-mono">{{ segment.fromPrice }}→{{ segment.toPrice }}</span>
                      <span class="text-gray-400">
                        {{ barLabel(segment.from.time) }}–{{ barLabel(segment.to.time) }}
                      </span>
                      <!-- The one thing the drawing cannot say: this line ends on the leg still
                           running, so it moves with every candle and may not be there tomorrow. -->
                      <span v-if="segment.provisional" class="text-amber-600">provisória</span>
                      <button
                        class="ml-auto text-gray-400 hover:text-gray-600"
                        :aria-label="`desselecionar ${TREND_LABELS[segment.side]}`"
                        @click="togglePin(overlay.producer, segment.id)"
                      >
                        ✕
                      </button>
                    </li>
                  </ul>
                </div>
                <template #fallback>
                  <div class="h-[20px]" />
                </template>
              </ClientOnly>

              <!-- The Forma rule this Pattern applies — the only thing on this page the browser
                   composes and the server runs. Under the same condition as the filters above, and
                   for a sharper version of the same reason: every committed field is a pipeline
                   run, and offering them under a Pattern nobody is looking at would spend one on
                   nothing.

                   Inside `ClientOnly` because the stored rule arrives after mount: the server
                   renders `PIPELINE_RULE` and the client may replace it, which is a hydration
                   mismatch anywhere it is rendered on both. Same guard as the timepicker above. -->
              <ClientOnly>
                <div
                  v-if="overlay.name === 'leg-reversals' && shown.has(overlay.producer)"
                  class="mt-2 space-y-2 border-l border-gray-100 pl-3 text-xs"
                >
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="font-semibold text-gray-500">Regra Forma</span>
                    <!-- The producer key is identical whichever rule ran — see `/patterns`. This
                         badge is the only thing on screen that tells an adjusted run from the
                         declared one, so it is not decoration. -->
                    <button
                      v-if="adjusted"
                      class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 hover:bg-amber-100"
                      @click="resetRule()"
                    >
                      ajustada · voltar ao padrão
                    </button>
                    <span v-else class="text-[10px] text-gray-400">a do pipeline</span>
                  </div>

                  <label v-if="savedRules.length" class="flex items-center justify-between gap-2">
                    <span class="text-gray-500">Carregar</span>
                    <select
                      class="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs"
                      value=""
                      @change="loadSaved(($event.target as HTMLSelectElement).value)"
                    >
                      <!-- Only the numbers are copied, so the list is a starting point and never a
                           claim about what the Series is called. -->
                      <option value="" disabled>só os números…</option>
                      <option v-for="entry in savedRules" :key="entry.name" :value="entry.name">
                        {{ entry.name }}
                      </option>
                    </select>
                  </label>

                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      :checked="rule.requireWfOverWc"
                      @change="updateRule({ requireWfOverWc: ($event.target as HTMLInputElement).checked })"
                    >
                    <span>exigir <code class="font-mono">wf &gt; wc</code></span>
                  </label>

                  <!-- `@change`, not `@input`: each committed value is a full pipeline run on the
                       server, and `@change` fires on blur or Enter. That is the debounce. -->
                  <label class="flex items-center justify-between gap-2">
                    <span class="text-gray-500"><code class="font-mono">wf ≥</code></span>
                    <input
                      type="number" step="0.01" min="0" max="1" :class="ruleField" :value="rule.wfMin"
                      @change="updateRule({ wfMin: Number(($event.target as HTMLInputElement).value) })"
                    >
                  </label>

                  <label class="flex items-center justify-between gap-2">
                    <span class="text-gray-500"><code class="font-mono">wc ≤</code></span>
                    <input
                      type="number" step="0.01" min="0" max="1" :class="ruleField" :value="rule.wcMax"
                      @change="updateRule({ wcMax: Number(($event.target as HTMLInputElement).value) })"
                    >
                  </label>

                  <label class="flex items-center justify-between gap-2">
                    <span class="text-gray-500"><code class="font-mono">wc ≤ k·wf</code></span>
                    <input
                      type="number" step="0.01" min="0" max="10" :class="ruleField" placeholder="sem k"
                      :value="rule.wcMaxRatio ?? ''"
                      @change="setRatio(($event.target as HTMLInputElement).value)"
                    >
                  </label>

                  <div class="flex items-center justify-between gap-2">
                    <span class="text-gray-500"><code class="font-mono">b</code> entre</span>
                    <span class="flex gap-1">
                      <input
                        type="number" step="0.05" min="0" :max="rule.bodyMax"
                        class="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                        :value="rule.bodyMin"
                        @change="setBody('bodyMin', ($event.target as HTMLInputElement).value)"
                      >
                      <input
                        type="number" step="0.05" :min="rule.bodyMin" max="1"
                        class="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                        :value="rule.bodyMax"
                        @change="setBody('bodyMax', ($event.target as HTMLInputElement).value)"
                      >
                    </span>
                  </div>

                  <label class="flex items-center justify-between gap-2">
                    <span class="text-gray-500">Cor</span>
                    <select
                      class="rounded border border-gray-300 px-1 py-0.5 text-xs"
                      :value="rule.colour"
                      @change="updateRule({ colour: ($event.target as HTMLSelectElement).value as Rule['colour'] })"
                    >
                      <option v-for="option in COLOUR_MODES" :key="option" :value="option">{{ option }}</option>
                    </select>
                  </label>

                  <label v-if="rule.colour === 'acima-de'" class="flex items-center justify-between gap-2">
                    <span class="text-gray-500">cor se <code class="font-mono">b &gt;</code></span>
                    <input
                      type="number" step="0.05" min="0" max="1" :class="ruleField" :value="rule.colourBodyMin"
                      @change="updateRule({ colourBodyMin: Number(($event.target as HTMLInputElement).value) })"
                    >
                  </label>
                </div>
              </ClientOnly>
            </div>
          </template>
        </div>

        <!-- A Pattern that raised drew nothing, and so did a Pattern that found nothing. Without
             this the two are indistinguishable on the chart. -->
        <div v-if="patterns?.failed?.length" class="mt-4 border-t border-gray-200 pt-3">
          <p class="text-xs font-semibold text-red-600">Falharam</p>
          <ul class="mt-1 space-y-1">
            <li v-for="producer in patterns.failed" :key="producer" class="font-mono text-xs break-all text-gray-500">
              {{ producer }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-gray-500">A exceção está no log do servidor.</p>
        </div>
      </aside>
    </div>
  </main>
</template>
