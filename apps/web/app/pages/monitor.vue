<script setup lang="ts">
import type { Component } from 'vue'
import { isTimeframe, SECONDS, TIMEFRAMES, type Candle, type Timeframe } from '~/types/candle'
import { producerName, type BarGap, type LegExtremes, type PatternPoint, type PatternResponse, type TrendLine } from '~/types/pattern'
import { parseRule, PIPELINE_RULE, sameRule, toPatternQuery } from '~/utils/rule'
import ZigZagOverlay from '~/components/ZigZagOverlay.vue'
import SimpleLegOverlay from '~/components/SimpleLegOverlay.vue'
import BarsOverlay from '~/components/BarsOverlay.vue'
import LegExtremesOverlay from '~/components/LegExtremesOverlay.vue'
import BarGapOverlay from '~/components/BarGapOverlay.vue'
import GeneralDirectionOverlay from '~/components/GeneralDirectionOverlay.vue'
import TrendLinesOverlay from '~/components/TrendLinesOverlay.vue'
import FormaRuleControls from '~/components/FormaRuleControls.vue'
import PatternLog from '~/components/PatternLog.vue'
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/resizable'
import { useElementSize } from '@vueuse/core'
import { ChevronRight, Ellipsis } from '@lucide/vue'

/**
 * Until instruments are a table, the picker offers what the database is known to hold.
 * Today that is the mini index future only, and only on `5m` and `1h` — the other two
 * timeframes render the empty state, which is the honest answer.
 */
const SYMBOLS = ['WIN@N'] as const

const DEFAULT_SYMBOL = 'WIN@N'
const DEFAULT_TIMEFRAME: Timeframe = '5m'

/** The height of the Log's title row: what a folded Log leaves behind, and its own handle. */
const LOG_STRIP_PX = 36

/**
 * The shortest a Log that is actually open may be. Dragging below it folds the panel instead, and
 * it is also what the first expand opens to — the splitter falls back to `minSize` when there is
 * no earlier size to restore, so this is the height of a Log nobody has dragged yet rather than a
 * token floor.
 */
const LOG_MIN_PX = 160

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
 * The third is the other half of the same test: `bars` is markers with no line, and its dots are
 * coloured by a field of the Point — which filter marked the bar — rather than by this file's
 * palette. Between them the three cover line-only, markers-only, and both, which is the case for
 * keeping the map.
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
  'bars': BarsOverlay,
  'leg-extremes': LegExtremesOverlay,
  'bar-gap': BarGapOverlay,
  // Markers-only again, like `bars`, but drawn in the palette colour: a turn of the general
  // direction carries no per-type hue to protect, only a side.
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
 * The Forma rule the pipeline should apply to `bars`, kept in `localStorage`.
 *
 * This is the one thing on this page the server does not decide. It is here rather than on
 * `/rules` because the bench judges `/shapes` in the browser and this Pattern cannot be judged
 * that way — it reads the average amplitude behind each bar, which never crosses the wire — so
 * the numbers travel instead. See the module docstring on `/patterns`.
 */
const { rule, update: updateRule, reset: resetRule } = useStoredRule()

// Reached directly rather than through `usePatterns`, which owns the automatic `GET`. `calculate`
// below asks the same route with a body, and that is not a fetch a composable keyed by a window
// and a rule can express.
const { public: { apiBase } } = useRuntimeConfig()

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
  if (shown.value.has(producer)) {
    shown.value.delete(producer)
    // The auto-hide button below unmounts with the Series; a timer left running would come back
    // marking a control whose moment has passed.
    stopFlash(producer)
  }
  else shown.value.add(producer)
}

/**
 * Producers whose control block is unfolded under the picker.
 *
 * Deliberately not `shown`: picking a Pattern opens its controls, and `Ligar` inside them is
 * what reaches the chart. One checkbox used to answer both questions, which meant you could not
 * read a Series' filters without drawing it, or leave it drawn without its controls in the way.
 *
 * The exception again, and for the reason `shown` is one: the column opens as the picker alone.
 */
const open = ref(new Set<string>())

/**
 * Everything the picker offers: the drawable Series, then the wick tool.
 *
 * The tool is in the list for the reason its chip used to sit in the row beside the Patterns —
 * from here it is one more thing you can put on the chart, and giving it a control of its own
 * would turn "no server ran for it" into a layout decision. Its dot is `WICK_HUES.high`, a
 * colour actually on the chart, where a Pattern's is its palette slot.
 */
const controls = computed(() => [
  ...overlays.value.map(overlay => ({
    key: overlay.producer,
    label: overlay.label,
    // Where a total, unique, unreadable string belongs: the row's tooltip, not its text.
    title: overlay.producer,
    color: overlay.color,
  })),
  { key: WICK_KEY, label: 'Pavio', title: 'pavios do candle sob o cursor', color: WICK_HUES.high },
])

/** `open` as the array the select speaks. The Set stays canonical — every block below asks it. */
const openList = computed(() => [...open.value])

/**
 * `reka-ui` types its emit as a single value even under `multiple`, where what arrives is the
 * array. Hence `:model-value` and a handler rather than `v-model`: the cast lives here, in one
 * named place, instead of failing the workspace's strict typecheck at the binding.
 */
function setOpen(value: unknown) {
  open.value = new Set(value as string[])
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
const DIRECTIONAL = new Set(['leg-extremes', 'bar-gap', 'bars'])

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
 * The wick tool's key, standing where a producer key stands.
 *
 * It is not a Pattern — nothing runs on the server for it, and it draws off the candles themselves —
 * but it is a chip beside them, with a control block, a `Ligar` and pins. Giving it a key buys the
 * whole of that bookkeeping unchanged: `shown`, `open`, `pinned`, `pinsFor`, `togglePin`,
 * `clearPins`. The alternative was a parallel set of each, which is four more places for the two
 * kinds of thing on this sidebar to drift apart.
 *
 * It cannot collide with a real producer: those always carry their `(params)` — see `producerName`.
 */
const WICK_KEY = 'wick-levels'

/**
 * The two wicks, in the order the filters are listed. The fourth filter axis on this page, and the
 * first belonging to something that is not a Pattern.
 *
 * Deliberately not `SIDES`, which it looks exactly like: that one names which extreme a *trend line*
 * runs along, and this one names a wick. The labels come from `WICK_LABELS`, so the checkboxes and
 * the pinned list below cannot end up calling one wick two different things.
 */
const WICK_SIDES = [
  { value: 'high', label: WICK_LABELS.high },
  { value: 'low', label: WICK_LABELS.low },
] as const

/**
 * Wicks the filters have turned *off*. The exception stored, as everywhere else on this page: the
 * tool is turned on to see both, and unchecking is the deliberate act.
 *
 * Unkeyed, unlike its four predecessors — there is one wick tool, not one per Series.
 */
const hiddenWickSides = ref(new Set<WickSide>())

function wickSides(): WickSide[] {
  return WICK_SIDES.map(item => item.value).filter(value => !hiddenWickSides.value.has(value))
}

function toggleWickSide(side: WickSide) {
  if (hiddenWickSides.value.has(side)) hiddenWickSides.value.delete(side)
  else hiddenWickSides.value.add(side)
}

/**
 * The wick tool's cursor is being held still.
 *
 * `Ligar` used to answer two questions at once: put the tool on the chart, *and* give the cursor a
 * new meaning. Those come apart the moment something is pinned — the pins are what you wanted to
 * keep, and the cursor goes on painting four lines over them on its way anywhere else. So `Ligar`
 * now means the tool is on the chart, which with the cursor held still means the pinned levels, and
 * this is the second question.
 *
 * Stored as the **off** state, which is this page's rule read properly rather than broken: every
 * switch here stores its non-default, and this one's default is on. Hunting for a level is what the
 * tool is turned on for, and that is the cursor.
 */
const wickPaused = ref(false)

function toggleWickTracking() {
  wickPaused.value = !wickPaused.value
}

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
 * Producers whose `Destacar por ponto` switch is on, keyed the way `shown` and `autoHide` are.
 *
 * Off by default and stored as the exception, the fourth time on this page — and here the rule has
 * a sharper reason than usual: with the switch on, a click on the chart means something it has
 * never meant before, and that is not a thing to turn on for somebody.
 */
const focusMode = ref(new Set<string>())

/**
 * The bar each Series is currently asking about — what the lines are highlighted *against*.
 *
 * A `Map` rather than the `Set` every other piece of state on this page is: the value is a bar time,
 * not a membership. Per producer for the same reason the sets are, even though one Series declares
 * this Pattern today.
 *
 * Nothing here says what a focus *does* to the drawing; that is `trendSegments`, which is also
 * where "the lines that end on this bar" is defined.
 */
const focusBar = ref(new Map<string, number>())

function focusFor(producer: string): number | null {
  return focusBar.value.get(producer) ?? null
}

function toggleFocusMode(producer: string) {
  if (focusMode.value.has(producer)) {
    focusMode.value.delete(producer)
    // Turning the switch off forgets the bar rather than parking it: the highlight is gone from the
    // chart, and a focus nothing on screen reflects would come back on a later click as a stale
    // answer to a question nobody remembers asking.
    focusBar.value.delete(producer)
  }
  else focusMode.value.add(producer)
}

/**
 * A click on the chart, once the switch is on: focus that bar. It never clears one.
 *
 * This used to clear when you clicked the focused bar again, and that fought the thing a focus is
 * for. A focused pivot is something you work *against* — you select one of the lines arriving at
 * it, then another, then another — and those clicks land on bars, so sooner or later one lands on
 * the focused bar and the highlight would vanish in the middle of the job. Clicks have to be free
 * to land anywhere.
 *
 * So the way out is the switch, which is the deliberate act and was always the better one:
 * `toggleFocusMode` drops the bar on its way off.
 */
function setFocusBar(producer: string, time: number | null) {
  // A click past the last bar names no bar, and leaves the focus alone rather than clearing it —
  // a missed click cannot cost the highlight either.
  if (time === null) return
  focusBar.value.set(producer, time)
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
 * Producers whose marks should be trimmed to those the *next* bar confirmed.
 *
 * Stored as the exception the fifth time on this page: a Series you turned on is a Series you want
 * to see, and asking for the stricter reading is the deliberate act. Off is what the chart drew
 * before this switch existed.
 */
const confirmedOnly = ref(new Set<string>())

/**
 * The Patterns whose marks the next bar can confirm, and so get the switch above.
 *
 * A set rather than a comparison for the reason `DIRECTIONAL` is one: the condition is asked in
 * two places — the props spread and the button — and it fell out of step once before, when a
 * second Pattern qualified and only one of the two sites learned about it. One entry today is not
 * an argument for spelling it twice.
 *
 * What "confirmed" means stays each util's own business: `barMarkers` reads the mark's own
 * direction, and a Series reporting the *move* a mark sits at rather than the turn it is a
 * candidate for would have to invert that. Nothing here decides it.
 */
const CONFIRMABLE = new Set(['bars'])

/**
 * The Patterns the Forma rule reaches, and so get the rule editor under them.
 *
 * Must match what `build_pipeline` hands the rule to — nothing checks it, and the failure is
 * quiet in both directions: a missing entry hides an editor for a Series the rule does move, and
 * a spurious one offers an editor that changes nothing on the Series it sits under.
 */
const RULED = new Set(['bars'])

function toggleConfirmedOnly(producer: string) {
  if (confirmedOnly.value.has(producer)) confirmedOnly.value.delete(producer)
  else confirmedOnly.value.add(producer)
}

/**
 * A map from a bar's `time` to the bar that immediately follows it, over the loaded window plus
 * any live bars — the input the confirmation filter reads.
 *
 * One map for the page rather than per Series, because every confirmable Series is measured
 * against the same candle history: the anchor moves with the pipeline run, but the bars don't.
 * A missing key means the bar is the newest one on screen, and the filter keeps such marks — see
 * `confirmed` in `utils/bars`. `mergedBars` puts the live bars in time order after the loaded
 * window, so the seam between the two links across like any other pair.
 */
const nextBarByTime = computed(() => {
  const map = new Map<number, { high: number, low: number }>()
  const all = mergedBars.value
  for (let i = 0; i < all.length - 1; i++) {
    const bar = all[i]!
    const next = all[i + 1]!
    map.set(bar.time, { high: next.high, low: next.low })
  }
  return map
})

/**
 * The candle history this page reasons about: the loaded window with every bar the feed has opened
 * since, in time order.
 *
 * Extracted from `nextBarByTime`, which was the only thing that needed it and is no longer: the
 * wick tool reads the same bars, and a second splice would be a second chance to disagree about the
 * seam.
 *
 * Merged over `live.history` and not over `live.bars`, which is the correction: a frame carries only
 * what changed, so a bar that opened after this page loaded and has since closed is in no frame at
 * all. The chart went on drawing it — `update()` accumulates in the series — while this list had
 * dropped it, and every question asked of a bar by name went unanswered for it.
 *
 * A map rather than a splice, which is also why there is no seam case left: the boundary bar is one
 * key, written twice. The live read wins, being the fresher reading of the same bar.
 */
const mergedBars = computed(() => {
  const merged = new Map<number, Candle>()
  for (const bar of candles.value ?? []) merged.set(bar.time, bar)
  for (const [time, bar] of live.history.value) merged.set(time, bar)
  return [...merged.values()].sort((a, b) => a.time - b.time)
})

/**
 * The same bars by `time` — what the wick tool looks a bar up in.
 *
 * A map for the reason `nextBarByTime` is one: the lookups are by name, one bar at a time, and they
 * happen on hover. Computed, so it is rebuilt when the feed moves and never while the mouse does.
 */
const barsByTime = computed(() => {
  const map = new Map<number, Candle>()
  for (const bar of mergedBars.value) map.set(bar.time, bar)
  return map
})

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

/**
 * A highlight lives as long as the fan it was picked out of.
 *
 * A focused pivot is read against the lines arriving at it, so when the timer takes those lines off
 * the chart the answer goes with the question: a window that closes and reopens on the next candle
 * would otherwise bring the fan back dimmed against a bar chosen minutes ago, which is the stale
 * highlight `toggleFocusMode` already refuses to park. The `Destacar por ponto` switch stays on —
 * the next window wants a fresh click, not a fresh setup.
 *
 * Only the Series listening to the timer: `hidden` is one flag for the page, and what each Series
 * makes of it is `onlyPinned`. See `extraProps`.
 */
watch(hideTimer.hidden, (hidden) => {
  if (!hidden) return
  for (const producer of autoHide.value) focusBar.value.delete(producer)
})

/** How long the button that just stopped hiding its levels keeps calling attention to itself. */
const FLASH_MS = 90_000

/**
 * Producers whose `Ocultar entre candles` button is still marked, keyed the way `autoHide` is.
 *
 * Turning the switch off is the click that puts the levels back on the chart for good, and it is
 * the one click here with no immediate picture of its own: the levels were probably on screen
 * already, inside a window the timer had opened. So the button says so itself for a minute and a
 * half — long enough to read the chart and come back to the control that undoes it, short enough
 * that a sidebar of Series is not a sidebar of blinking buttons.
 *
 * Per producer, and not one flag for the page the way `hideTimer` is one timer for it: the whole
 * question is *which* button, and a shared flag would mark every one of them and answer nothing.
 */
const flashing = ref(new Set<string>())
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>()

function stopFlash(producer: string) {
  const timer = flashTimers.get(producer)
  if (timer !== undefined) clearTimeout(timer)
  flashTimers.delete(producer)
  flashing.value.delete(producer)
}

onScopeDispose(() => {
  for (const timer of flashTimers.values()) clearTimeout(timer)
})

function toggleAutoHide(producer: string) {
  if (autoHide.value.has(producer)) {
    autoHide.value.delete(producer)
    flashing.value.add(producer)
    flashTimers.set(producer, setTimeout(() => stopFlash(producer), FLASH_MS))
  }
  else {
    autoHide.value.add(producer)
    // Green again: this is no longer the button that changed.
    stopFlash(producer)
    // Turning it on means "get out of the way", so it goes now rather than in half a minute. The
    // timer takes over at the next bar, which is the only moment it was ever measuring.
    hideTimer.hide()
    // What the watcher above cannot see: joining `autoHide` inside a window that is already closed
    // flips no flag, and this Series' fan still goes away on this click.
    focusBar.value.delete(producer)
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

/** `limpar`: everything this Series has on the list, which for `trend-lines` includes its moves. */
function clearPins(producer: string) {
  for (const key of pinsFor(producer)) pinned.value.delete(pinKey(producer, key))
  for (const key of movesFor(producer)) moves.value.delete(pinKey(producer, key))
}

/**
 * The trend lines somebody adjusted by hand, keyed the way `pinned` is: `producer|` and then one
 * `moveKey` — the line the engine proposed, and the candle anchor its far end was dragged onto.
 *
 * A set of its own rather than more entries in `pinned`, because a move is not a pin of a line the
 * pipeline produced: there is no such line, and every id in `pinned` has to be one an overlay can
 * resolve against its Points. What the two share is that **a move is its own pin** — a hand-placed
 * line is always extended and always survives the hide timer, since adjusting one is only ever done
 * in order to read where it now points. So there is no state that says a moved line is selected,
 * and nothing that could disagree with it.
 *
 * Stored beside the pins and resolved the same way, against the current Points and the current
 * bars. A move whose line is gone from the window takes itself off the list, which is the same
 * honest reading `pinned` gives.
 */
const moves = ref(new Set<string>())

/** The bare move keys for one Series, which is what its overlay speaks. */
function movesFor(producer: string): string[] {
  const prefix = `${producer}|`
  return [...moves.value].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
}

/**
 * A line's far end was dropped on a candle: keep the move, and let go of what it replaces.
 *
 * Two things go, and both are the request as stated. The line's earlier move, if it had one — a
 * line is moved *from* somewhere, not to several places at once, so a second drag adjusts the same
 * line rather than forking it. And the origin's pin: what the engine proposed is still a real
 * Pattern and stays drawn in the fan, but it is no longer the line you are reading, so it stops
 * being extended and stops being listed. The moved line is the one in `Selecionadas`.
 */
function applyMove(producer: string, key: string) {
  const move = parseMove(key)
  if (move === null) return

  for (const existing of movesFor(producer)) {
    if (parseMove(existing)?.origin === move.origin) moves.value.delete(pinKey(producer, existing))
  }

  pinned.value.delete(pinKey(producer, move.origin))
  moves.value.add(pinKey(producer, key))
}

/**
 * A row of `Selecionadas` back to the move that made it, so the list's `✕` can name what to remove.
 * `null` for a line the engine drew itself, which is unpinned rather than un-moved.
 */
function moveOf(segment: DrawnTrend): string | null {
  if (segment.origin === undefined || segment.field === undefined) return null
  return moveKey(segment.origin, segment.to.time, segment.field)
}

/**
 * The `✕` on a moved line: un-move it. The origin does not come back selected — it is still there
 * in the fan, and a click puts it back on the list if that is what you wanted.
 */
function removeMove(producer: string, key: string) {
  moves.value.delete(pinKey(producer, key))
}

/**
 * The six sets above, remembered between visits — everything about the sidebar that is keyed by
 * producer and nothing that is not. See `useStoredOverlays` for why the write is automatic and the
 * read is the `Restaurar` item in the menu beside the heading.
 *
 * Here rather than beside `shown`, because it needs all six and `moves` is the last of them.
 */
const layout = useStoredOverlays({ shown, open, pinned, moves, autoHide, confirmedOnly })

/**
 * `Ctrl+Z` over the two of those six that are a selection rather than a preference. See
 * `useSelectionHistory` for why it is those two, and why it watches them instead of being called
 * from `togglePin` and the three functions beside it.
 */
const history = useSelectionHistory({ pinned, moves })

/**
 * The shortcuts, on the window because the chart is a canvas and the sidebar is a column of buttons
 * — there is no one element that could hold the focus this belongs to, and asking the page to be
 * clicked before `Ctrl+Z` works would be a rule nobody can see.
 *
 * A text field keeps its own undo: the Forma rule's inputs are on this page, and stealing `Ctrl+Z`
 * from a number somebody is halfway through typing would be a worse trade than any pin is worth.
 * `preventDefault` only when a step actually happened, for the same reason — at the ends of the
 * history the browser should get its default back rather than have the key silently swallowed.
 */
function onKeyDown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (event.key.toLowerCase() !== 'z') return

  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return

  if (event.shiftKey ? history.redo() : history.undo()) event.preventDefault()
}

// `globalThis` rather than `window`, which on this page is the time window a few hundred lines up.
onMounted(() => globalThis.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onKeyDown))

/**
 * `Restaurar`'s click: the saved layout, and then the hide it stands for.
 *
 * `hideTimer.hide()` for the reason `toggleAutoHide` calls it. `Ocultar entre candles` is two facts
 * — which Series listen to the timer, and whether the timer is in its hidden phase — and only the
 * first is a preference worth storing. `useHideTimer` deliberately refuses to hide on the rising
 * edge of `enabled`, so a switch that arrives already on has no moment to hide *at*: the chart
 * would draw in full under a button reading `oculto`, which is worse than not restoring it. A
 * restore is that moment, exactly as the click is.
 *
 * The history is dropped rather than extended by one: a selection arriving whole from another visit
 * is not a step, and `Ctrl+Z` out of it would land on whatever this page happened to hold first.
 */
function restoreLayout() {
  layout.load()
  history.reset()
  if (autoHide.value.size > 0) hideTimer.hide()
}

/**
 * The pinned lines as the pipeline wants them: an id, the bar they start on, and a price.
 *
 * Read back through `pinnedSegments` and `pinnedWicks` rather than off `pinned` directly, so the
 * lines that travel are exactly the ones on the screen — a pin whose leg is gone, whose bar has
 * scrolled out of the window, or whose side is unchecked resolves to nothing in both, and asking
 * the server about a line nobody can see would put an answer in the response with nothing to
 * attach it to.
 *
 * Only the two the question is about. `bar-gap` is a band and `trend-lines` is sloped; neither is
 * a level, and `line-relations` reads one price per line. A sloped line is a real question and a
 * different Pattern, not a wider parameter on this one.
 *
 * `ExtremeSegment` and `WickLevel` both extend `LevelSegment`, which is already `{ id, time,
 * price }` — so this is a narrowing, not a mapping, and there is no second definition of what a
 * pinned line is.
 */
const pinnedLines = computed(() =>
  [
    ...overlays.value
      .filter(overlay => overlay.name === 'leg-extremes')
      .flatMap(overlay => pinnedSegments(overlay)),
    ...pinnedWicks(),
  ].map(({ id, time, price }) => ({ id, time, price })),
)

/** What the last `Calcular` answered, and what it is doing. Nothing draws these yet. */
const relations = ref<PatternResponse | null>(null)
const calculating = ref(false)
const calculateError = ref<string | null>(null)

/**
 * `Calcular`'s click: the pipeline again, this time told about the lines on the screen.
 *
 * This is the one run the automatic ones cannot be. `usePatterns` re-fetches on every closed bar
 * and on every rule edit, but it asks a `GET` and a `GET` carries no lines — the pinned set is a
 * `Set<string>` in this page and nowhere else, so the server has no way to know a level exists
 * until somebody hands it over. Hence a menu item rather than a watcher: the run is a question a
 * person asks about lines they just placed, and re-asking it on every bar would send a body the
 * size of the selection at a cadence nobody chose.
 *
 * `$fetch` and not `useFetch`, deliberately. This is an imperative action with no key: the
 * response is not state Nuxt should cache, hydrate, or dedupe against the `GET` that shares its
 * URL, and `useFetch`'s own key knows nothing about a body.
 *
 * The result stays in its own ref and is *not* merged into `patterns`. That data belongs to
 * `useFetch`, whose key names a window and a rule and cannot name a set of lines — writing into
 * it would make the next automatic re-run silently drop the answer.
 *
 * The same window and the same rule the automatic run uses, so the two answers are about one
 * pipeline over one span of bars. See the module docstring on `/patterns` for why the rule and
 * the lines are the only two things this page may hand the server.
 */
async function calculate() {
  if (calculating.value || pinnedLines.value.length === 0) return

  calculating.value = true
  calculateError.value = null

  try {
    relations.value = await $fetch<PatternResponse>('/patterns', {
      baseURL: apiBase,
      method: 'POST',
      query: { ...runWindow.value, ...(rule.value ? toPatternQuery(rule.value) : {}) },
      body: { lines: pinnedLines.value },
    })
  }
  catch (error) {
    // Kept rather than thrown: a failed manual run must not take the chart down with it.
    relations.value = null
    calculateError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    calculating.value = false
  }
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
 *
 * No `focus`, unlike the overlay, and this is the one place the list is deliberately not a mirror
 * of the chart: dimming is emphasis on a drawing, not a change to what a line is, and a swatch at
 * `DIM_ALPHA` would read as a broken row rather than as a legend. The side filter is still passed,
 * because that one really does take lines off the screen.
 */
function pinnedTrends(overlay: { producer: string, points: PatternPoint[], color: string }): DrawnTrend[] {
  const ids = new Set(pinsFor(overlay.producer))
  const keys = movesFor(overlay.producer)
  if (ids.size === 0 && keys.length === 0) return []

  return [
    ...trendSegments(
      overlay.points as TrendLine[],
      sidesFor(overlay.producer),
      overlay.color,
      ids,
    ).filter(segment => ids.has(segment.id)),
    // The hand-adjusted lines are on this list for the same reason the pinned ones are: they are
    // what is extended on the chart. A move is its own pin, so they need no membership test — a
    // move that no longer resolves has already dropped out of `movedSegments`.
    ...movedSegments(
      overlay.points as TrendLine[],
      sidesFor(overlay.producer),
      overlay.color,
      keys,
      barsByTime.value,
    ),
  ]
}

/**
 * The pinned wick levels as things with a colour, a wick, an end and a price — what the list under
 * the tool's checkboxes shows.
 *
 * Through the same `wickLevels` the overlay draws from, so the list and the chart cannot disagree,
 * and a pin whose bar has left the window simply does not resolve. No hovered bar is passed: this
 * list is what survives the cursor moving on, which is what a pin means here.
 *
 * The side filter is passed, for the reason `pinnedSegments` passes the one it has: a level hidden
 * by a checkbox is not on screen, and the list is a legend for what is.
 */
function pinnedWicks(): WickLevel[] {
  const ids = new Set(pinsFor(WICK_KEY))
  if (ids.size === 0) return []

  return wickLevels(barsByTime.value, null, ids, wickSides())
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
 * The splitter between the chart and the Log, in the pixels its two constants are written in.
 *
 * `reka-ui` lays panels out in percentages, so every height here has to be divided by the box the
 * two share — measured, because that box is whatever the window leaves after the header. Hence
 * the wrapper the ref sits on: it has a height of its own (`h-[560px] lg:h-full`) before the
 * splitter inside it has laid anything out, which is what makes it measurable at all.
 */
const splitArea = ref<HTMLElement | null>(null)
const { height: observedHeight } = useElementSize(splitArea)

/**
 * The same height, read once by hand at mount.
 *
 * A `ResizeObserver` does not fire while the tab is hidden, and a page opened in a background tab
 * is the ordinary way to open one: without this the splitter would wait for its first
 * measurement, and the chart would be a blank box until the tab was looked at. The observer is
 * still what keeps the number honest afterwards, so it wins as soon as it has anything to say.
 */
const measuredHeight = ref(0)

// Watched rather than read in `onMounted`: the wrapper is inside a `<ClientOnly>`, which renders
// its children a tick *after* this page has mounted, so at `onMounted` the ref is still null.
watch(splitArea, (element) => {
  if (element) measuredHeight.value = element.getBoundingClientRect().height
}, { flush: 'post' })

const splitBox = computed(() => observedHeight.value || measuredHeight.value)

const logStored = useStoredLogHeight()

/** Zero while the box is unmeasured — the splitter is not rendered until it is. */
function splitPercent(px: number) {
  return splitBox.value > 0 ? Math.min(100, (px / splitBox.value) * 100) : 0
}

const logStripPercent = computed(() => splitPercent(LOG_STRIP_PX))
const logMinPercent = computed(() => splitPercent(LOG_MIN_PX))

/** The remembered height, or the folded strip on a first visit. */
const logStartPercent = computed(() => splitPercent(Math.max(logStored.height.value ?? 0, LOG_STRIP_PX)))

/**
 * Both halves of the split are known: the box has been measured and storage has been read. The
 * splitter takes its layout from props once, so it must not be rendered before either answer.
 */
const splitReady = computed(() => splitBox.value > 0 && logStored.ready.value)

/** Back into pixels, which is the only unit worth keeping — see `useStoredLogHeight`. */
function rememberSplit(sizes: number[]) {
  const log = sizes[1]
  if (log === undefined || splitBox.value <= 0) return
  logStored.remember((log / 100) * splitBox.value)
}

/**
 * The props only one overlay takes, spread into the `component` so the others never see them —
 * an unknown attribute would fall through onto components that render no root element.
 */
function extraProps(overlay: { producer: string, name: string }) {
  return {
    ...DIRECTIONAL.has(overlay.name) ? { directions: directionsFor(overlay.producer) } : {},
    // The confirmation filter: a mark survives only if the next bar broke the way it predicted.
    // `null` off, which is the drawing the chart had before this switch.
    ...CONFIRMABLE.has(overlay.name) && confirmedOnly.value.has(overlay.producer)
      ? { nextByTime: nextBarByTime.value }
      : {},
    // The second filter axis, and `bar-gap`'s alone — see `STATES`.
    ...overlay.name === 'bar-gap' ? { states: statesFor(overlay.producer) } : {},
    // The third, and `trend-lines`' alone — tops or bottoms, which is not the bull/bear question
    // above however much the two rows look alike. See `SIDES`.
    ...overlay.name === 'trend-lines'
      ? {
          sides: sidesFor(overlay.producer),
          focus: focusFor(overlay.producer),
          // Only wired while the switch is on. With it off the overlay still reports every click's
          // bar — it cannot know the switch exists — and nothing here is listening, so a click on
          // the chart means exactly what it has always meant.
          // The switch again, at the cursor: hovering a line draws it as though it were selected.
          // Not gated on a bar being chosen — the preview is worth having on the raw fan too, and
          // once a bar *is* chosen only the lit lines are hit-testable, so only they preview.
          previewOnHover: focusMode.value.has(overlay.producer),
          // The hand-adjusted lines, and the candles a drag snaps to. Both belong to this Pattern
          // alone: it is the only one whose drawing anybody edits.
          moves: movesFor(overlay.producer),
          bars: barsByTime.value,
          onMove: (key: string) => applyMove(overlay.producer, key),
          onUnmove: (key: string) => removeMove(overlay.producer, key),
          ...focusMode.value.has(overlay.producer)
            ? { onBar: (time: number | null) => setFocusBar(overlay.producer, time) }
            : {},
        }
      : {},
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
 * Whether a Series is drawn right now, which is the `Ligar` button and nothing else.
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
           inside — on the splitter, which is what divides this panel between the chart and the
           Log. -->
      <section class="min-w-0 flex-1 overflow-hidden border-y border-gray-200">
        <!-- Client-only as a whole, not just around the canvas: the split is measured off the DOM
             and read back from `localStorage`, neither of which the server can do. The fallback
             holds the same box so the page does not jump when the real one arrives. -->
        <ClientOnly>
          <!-- The box the two panels divide, and the only tag here with a height of its own. The
               splitter works in percentages, so something has to say what they are a percentage
               *of*; `h-[560px]` below `lg` is the 520px chart the page has always shown plus the
               folded Log strip. -->
          <div ref="splitArea" class="h-[560px] w-full lg:h-full">
            <!-- The chart and the Log are two panels of one splitter rather than a chart with a
                 `Collapsible` under it: how much of the screen a log is worth changes by the
                 minute, and that judgement belongs to the reader's drag. Folding survives as the
                 Log panel collapsing to its own title row, which is the half of the old control
                 worth keeping.

                 Held back until `splitReady`, because a splitter reads its layout from these
                 props once: rendered a tick early it would lay out against an unmeasured box and
                 then have to be shoved into place, which is a jump the reader would see. -->
            <ResizablePanelGroup
              v-if="splitReady"
              direction="vertical"
              class="h-full"
              @layout="rememberSplit"
            >
              <ResizablePanel :min-size="30" class="min-w-0 overflow-hidden">
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

                <!-- `CandleChart` has no height of its own — the box is the caller's to state, and
                     the box is now this panel, at whatever the drag has left it. The library
                     resizes itself from there: it runs with `autoSize`. -->
                <CandleChart v-else class="h-full" :candles="candles" :live-bars="live.bars.value">
                  <component
                    :is="overlay.component"
                    v-for="overlay in overlays"
                    :key="overlay.producer"
                    :points="overlay.points"
                    :color="overlay.color"
                    :visible="isVisible(overlay)"
                    v-bind="extraProps(overlay)"
                  />
                  <!-- Not one of the overlays above, and so not in the loop: it draws off the candles
                       rather than off a Series the pipeline produced, and has no Points, no colour from
                       the palette and no producer. What it shares with them is the chip and the pins. -->
                  <WickLevelsOverlay
                    :bars="barsByTime"
                    :visible="shown.has(WICK_KEY)"
                    :sides="wickSides()"
                    :pinned="pinsFor(WICK_KEY)"
                    :tracking="!wickPaused"
                    @pin="(id: string) => togglePin(WICK_KEY, id)"
                  />
                </CandleChart>
              </ResizablePanel>

              <!-- No grip: the seam already reads as the border between the two panels, and a pill
                   pinned to its middle is a mark across the chart for a drag the cursor announces
                   by itself. The class is not decoration — neither reka nor the wrapper draws a
                   resize cursor, so it has to be asked for. -->
              <ResizableHandle class="cursor-row-resize" />

              <!-- Inside this panel rather than under the whole row, so the sidebar keeps running the
                   full height beside it: the Log is about what the chart is showing, not about the
                   page — and the chart, not the sidebar, is what gives up the space.

                   What it holds is the Series that are read rather than drawn, fed from `relations`
                   and not from `patterns`. Line relations is about the lines a person pinned, and
                   only the manual run carries them, so the automatic response has nothing to say
                   here — see `calculate` above.

                   The title row is the whole hit area, and clicking it is the same fold that dragging
                   past `LOG_MIN_PX` performs: both end up in `isCollapsed`, so the chevron cannot
                   disagree with the panel about which way it is. -->
              <ResizablePanel
                v-slot="{ isCollapsed, collapse, expand }"
                collapsible
                :collapsed-size="logStripPercent"
                :default-size="logStartPercent"
                :min-size="logMinPercent"
                class="flex min-w-0 flex-col overflow-hidden"
              >
                <button
                  class="flex w-full shrink-0 items-center gap-2 px-4 py-2 text-left text-sm font-semibold hover:bg-gray-50"
                  @click="isCollapsed ? expand() : collapse()"
                >
                  <ChevronRight
                    class="size-3.5 shrink-0 text-gray-400 transition-transform"
                    :class="!isCollapsed && 'rotate-90'"
                  />
                  Log
                </button>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                  <PatternLog :response="relations" :pending="calculating" :error="calculateError" />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          <template #fallback>
            <div class="h-[560px] w-full lg:h-full" />
          </template>
        </ClientOnly>
      </section>

      <!-- A sidebar full of unfolded filters scrolls inside itself rather than pushing the chart
           off screen. No height is named here any more: the row states one, and this panel takes
           whatever it gives — which is why `lg:min-h-0` up there is not optional.

           Only at `lg`, for the reason the row is only a row there: stacked under the chart, a
           nested scroll area is worse than the page scroll it would replace. -->
      <aside class="w-full shrink-0 border-y border-gray-200 p-4 lg:w-80 lg:overflow-y-auto lg:border-l">
        <h2 class="flex items-baseline justify-between gap-2 text-sm font-semibold">
          Padrões
          <span class="flex shrink-0 items-baseline gap-2 font-normal">
            <!-- The run is now started by editing a field, so it needs to say it is running. -->
            <span v-if="patternsPending" class="text-xs text-gray-400">rodando…</span>

            <!-- The sidebar's own actions, which are about the panel rather than about any one
                 Pattern. `Restaurar` puts back what the sidebar looked like when you left it:
                 which Patterns were unfolded, which were drawn, what was pinned under each. The
                 saving happens by itself; this is the half that is a decision, so it is a click —
                 a reload that silently redrew the chart would be the page choosing for you.

                 The trigger stays enabled when there is nothing saved and only the item goes dim:
                 a dead ellipsis would hide `Calcular` behind a fact that has nothing to do with
                 it, and say nothing about which of the two is unavailable.

                 `ClientOnly` because whether there is anything to load is a fact only the browser
                 has, the same guard the timepicker and the rule controls need. -->
            <ClientOnly>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <button
                    class="flex size-[22px] items-center justify-center rounded border border-gray-300 text-gray-500 hover:text-gray-700"
                    title="ações do painel"
                  >
                    <Ellipsis class="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="text-xs">
                  <DropdownMenuItem
                    :disabled="!layout.saved.value"
                    title="restaurar padrões e fixados salvos"
                    @select="restoreLayout()"
                  >
                    Restaurar
                  </DropdownMenuItem>
                  <!-- Dim with nothing pinned: this run exists to ask about lines, and with none
                       it would send an empty body for an answer nobody could read. -->
                  <DropdownMenuItem
                    :disabled="calculating || !pinnedLines.length"
                    title="rodar o pipeline sobre as linhas fixadas"
                    @select="calculate()"
                  >
                    Calcular
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <template #fallback>
                <div class="size-[22px]" />
              </template>
            </ClientOnly>
          </span>
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

        <!-- One picker, and under it the control block of whichever entries are ticked. Ticking
             draws nothing — it opens and closes the control — and `Ligar` inside the control is
             what reaches the chart. Those are two facts about one Pattern, and the checkbox this
             all replaced had to stand for both at once.

             This was a chip per Pattern until the pipeline reached eight of them: the row then
             wrapped to four lines inside an `lg:w-80` column and pushed the control blocks — the
             thing you opened the sidebar for — below the fold. A `multiple` select trades the
             chips' one advantage, every choice legible at rest, for a single line of chrome.

             Not the `v-else` of the message above: the last entry is the wick tool, which reads
             the candles and has something to draw whether or not the pipeline found anything. The
             message stays, because it is still true of the Patterns. -->
        <div>
          <!-- `:model-value` with a handler rather than `v-model` — see `setOpen`. -->
          <Select multiple :model-value="openList" @update:model-value="setOpen">
            <SelectTrigger size="sm" class="mt-3 w-full">
              <!-- A count, not the values: under `multiple` the default renderer joins the raw
                   producer keys, and those are `zig-zag(3)`-shaped and unreadable at any width.
                   Which ones are ticked is answered by the list, and by the blocks below it. -->
              <span :class="open.size ? '' : 'text-muted-foreground'">
                {{ open.size ? `${open.size} ${open.size === 1 ? 'padrão' : 'padrões'}` : 'Escolher padrões' }}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="control in controls"
                :key="control.key"
                :value="control.key"
                :title="control.title"
              >
                <!-- Lit in the Series' palette colour while it is drawn and hollow while it is
                     not, so the list still says what is on the chart — a question the tick to its
                     right does not answer. Always rendered: a dot that appeared would resize the
                     row under the cursor. -->
                <span
                  class="size-1.5 shrink-0 rounded-full border"
                  :style="shown.has(control.key)
                    ? { backgroundColor: control.color, borderColor: control.color }
                    : { backgroundColor: 'transparent', borderColor: 'currentColor', opacity: 0.4 }"
                />
                {{ control.label }}
              </SelectItem>
            </SelectContent>
          </Select>

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
                {{ shown.has(overlay.producer) ? 'Desligar' : 'Ligar' }}
              </button>

              <!-- Only under a Series that is actually drawn: with `Ligar` off there is nothing
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

              <!-- Trims each Series' marks to those the *next* bar confirmed: a bull-turn
                   candidate needs the next bar to break above its high, a bear-turn candidate to
                   break below its low. Which field that test reads is the util's business, not
                   this button's. Off is what the chart drew before this switch — every mark shown,
                   undecided included. Marks on the newest bar stay whichever way the switch is
                   set, as do inside bars, which predict nothing for a break to confirm. -->
              <div
                v-if="CONFIRMABLE.has(overlay.name) && shown.has(overlay.producer)"
                class="mt-1"
              >
                <button
                  class="rounded border px-2 py-0.5 text-xs"
                  :class="confirmedOnly.has(overlay.producer)
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-500'"
                  @click="toggleConfirmedOnly(overlay.producer)"
                >
                  Só confirmados
                </button>
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

              <!-- The fan is the problem this answers: a few hundred strokes in one colour, and the
                   thing worth reading in them is which lines converge on one pivot. On, a click
                   picks a candle and the lines arriving there keep their colour while the rest fade
                   back — dimmed and not hidden, because the convergence only reads against the fan
                   it was picked out of.

                   Under the side filter rather than beside it: that row decides what exists, this
                   one only decides what stands out. -->
              <div
                v-if="overlay.name === 'trend-lines' && shown.has(overlay.producer)"
                class="mt-1"
              >
                <button
                  class="rounded border px-2 py-0.5 text-xs"
                  :class="focusMode.has(overlay.producer)
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-500'"
                  @click="toggleFocusMode(overlay.producer)"
                >
                  Destacar por ponto
                  <!-- Which candle is being asked about. The only place it is written down: on the
                       chart it is wherever the lit lines happen to meet. -->
                  <span v-if="focusFor(overlay.producer) !== null" class="ml-1 text-gray-500">
                    · {{ barLabel(focusFor(overlay.producer)!) }}
                  </span>
                </button>

                <!-- Only until the first click, and needed because the switch on its own changes
                     nothing visible: the whole feature is a click on the chart. -->
                <p
                  v-if="focusMode.has(overlay.producer) && focusFor(overlay.producer) === null"
                  class="mt-0.5 text-xs text-gray-400"
                >
                  Clique num candle para destacar as linhas que terminam nele.
                </p>
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
                   the picture cannot be read at all. `bars` colours its dots the same way and has
                   no key either; that is left as it is rather than quietly widened here. -->
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
                    :class="[
                      autoHide.has(overlay.producer)
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-300 text-gray-500',
                      flashing.has(overlay.producer) ? 'stay-flash' : '',
                    ]"
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
                    Clique numa linha do gráfico para estendê-la até o candle atual. Depois arraste
                    a ponta dela para movê-la até outro candle.
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
                      <!-- A line whose far end you placed yourself, and the anchor you placed it
                           on. The chart cannot say the second half: every line ends on a price, and
                           only this list can say *which* of the candle's four it is. -->
                      <span v-if="segment.field" class="text-gray-400">
                        movida · {{ FIELD_LABELS[segment.field] }}
                      </span>
                      <!-- The one thing the drawing cannot say: this line ends on the leg still
                           running, so it moves with every candle and may not be there tomorrow. -->
                      <span v-if="segment.provisional" class="text-amber-600">provisória</span>
                      <button
                        class="ml-auto text-gray-400 hover:text-gray-600"
                        :aria-label="`desselecionar ${TREND_LABELS[segment.side]}`"
                        @click="moveOf(segment) ? removeMove(overlay.producer, moveOf(segment)!) : togglePin(overlay.producer, segment.id)"
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

              <!-- The Forma rule these Patterns apply — the only thing on this page the browser
                   composes and the server runs. Under the same condition as the filters above, and
                   for a sharper version of the same reason: every committed field is a pipeline
                   run, and offering them under a Pattern nobody is looking at would spend one on
                   nothing.

                   Rendered once per Pattern that reads the rule, over **one** stored rule and one
                   query: an edit under either chip re-runs both Series. That is deliberate — the
                   two are the same filters with and without a leg, and the comparison is the point
                   — and it is written out in the component.

                   Inside `ClientOnly` because the stored rule arrives after mount: the server
                   renders `PIPELINE_RULE` and the client may replace it, which is a hydration
                   mismatch anywhere it is rendered on both. Same guard as the timepicker above. -->
              <ClientOnly>
                <FormaRuleControls
                  v-if="RULED.has(overlay.name) && shown.has(overlay.producer)"
                  :rule="rule"
                  :adjusted="adjusted"
                  :saved-rules="savedRules"
                  @update="updateRule"
                  @reset="resetRule"
                  @load="loadSaved"
                />
              </ClientOnly>
            </div>
          </template>

          <!-- The wick tool's control block, in the same shape as a Pattern's and after all of
               them, because its chip is the last in the row. Written out rather than folded into
               the loop above: it has no Series, no point count and no timeframe to warn about, and
               a row of `v-if`s standing in for those would say nothing about either kind. -->
          <div v-if="open.has(WICK_KEY)" class="mt-3 border-t border-gray-200 pt-3">
            <div class="flex items-baseline justify-between gap-2 text-xs">
              <span class="min-w-0 truncate font-medium" :style="{ color: WICK_HUES.high }">
                Pavio do candle
              </span>
              <!-- Where a Pattern says how many points it found. This one finds nothing until the
                   cursor is somewhere, so it says what it does instead. -->
              <span class="shrink-0 text-gray-500">no cursor</span>
            </div>

            <button
              class="mt-1.5 rounded border px-2 py-0.5 text-xs"
              :class="shown.has(WICK_KEY)
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-gray-300 text-gray-500'"
              @click="toggle(WICK_KEY)"
            >
              {{ shown.has(WICK_KEY) ? 'Desligar' : 'Ligar' }}
            </button>

            <!-- The second question the button above used to answer as well: whether the cursor
                 draws. Off, the tool holds still and shows what is pinned — which is what you want
                 the moment you have pinned something.

                 A fixed label with the state in the styling, like `Ocultar entre candles` and
                 `Destacar por ponto`. Not called `Ativar`: it starts on, and a button reading
                 "activate" while already active says the wrong thing in its resting state. -->
            <button
              v-if="shown.has(WICK_KEY)"
              class="mt-1.5 ml-1.5 rounded border px-2 py-0.5 text-xs"
              :class="wickPaused
                ? 'border-gray-300 text-gray-500'
                : 'border-green-600 bg-green-50 text-green-700'"
              @click="toggleWickTracking"
            >
              Seguir o cursor
              <span class="ml-1 text-gray-500">· {{ wickPaused ? 'pausado' : 'ativo' }}</span>
            </button>

            <!-- Only while the tool is on, as with every filter row on this page: with `Ligar`
                 off there is nothing for these to filter. -->
            <div v-if="shown.has(WICK_KEY)" class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <label
                v-for="side in WICK_SIDES"
                :key="side.value"
                class="flex items-center gap-1.5"
              >
                <input
                  type="checkbox"
                  :checked="!hiddenWickSides.has(side.value)"
                  @change="toggleWickSide(side.value)"
                >
                <!-- The colour key and the checkbox in one: each wick is drawn in its own hue, and
                     a separate legend for two rows would be a legend for a list of two. -->
                <span class="inline-block h-0.5 w-3 shrink-0" :style="{ backgroundColor: WICK_HUES[side.value] }" />
                <span class="text-gray-500">{{ side.label }}</span>
              </label>
            </div>

            <p v-if="shown.has(WICK_KEY)" class="mt-1 text-xs text-gray-400">
              <template v-if="wickPaused">
                Só os pavios fixados. Ative para seguir o cursor de novo.
              </template>
              <template v-else>
                Passe o cursor por um candle para ver onde seus pavios começam e terminam.
              </template>
            </p>

            <!-- What survives the cursor moving on. `ClientOnly` because a pin only exists after a
                 click, the same reason the three Pattern lists are wrapped. -->
            <ClientOnly>
              <div v-if="shown.has(WICK_KEY)" class="mt-1 text-xs">
                <div v-if="pinnedWicks().length" class="flex items-baseline justify-between gap-2">
                  <span class="text-gray-500">Fixados</span>
                  <button class="text-gray-400 hover:text-gray-600" @click="clearPins(WICK_KEY)">
                    limpar
                  </button>
                </div>
                <p v-else class="text-gray-400">
                  Clique numa linha do gráfico para mantê-la fixada.
                </p>

                <ul class="mt-1 space-y-0.5">
                  <li
                    v-for="level in pinnedWicks()"
                    :key="level.id"
                    class="flex items-center gap-1.5 text-gray-500"
                  >
                    <span class="inline-block h-0.5 w-3 shrink-0" :style="{ backgroundColor: level.color }" />
                    <span>{{ WICK_LABELS[level.side] }} · {{ WICK_END_LABELS[level.end] }}</span>
                    <span class="font-mono">{{ level.price }}</span>
                    <span class="text-gray-400">{{ barLabel(level.time) }}</span>
                    <button
                      class="ml-auto text-gray-400 hover:text-gray-600"
                      :aria-label="`desafixar ${WICK_LABELS[level.side]} ${WICK_END_LABELS[level.end]}`"
                      @click="togglePin(WICK_KEY, level.id)"
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
          </div>
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

<style scoped>
/* An unhurried beat, because it runs for a minute and a half: any quicker and it reads as an
   alarm, and nothing here is wrong. Slower and the amber leaves before it has arrived, which is
   a fade rather than a mark. Only the background moves — border and text staying put keep it the same control
   throughout. It rests on `transparent` rather than a colour: this only ever runs on the button's
   off state, which has no fill of its own, and naming one here would repaint the sidebar's ground.
   `infinite` and not a count: `flashing` decides when it ends, in one place.

   Reduced motion drops the pulse rather than slowing it: the grey border and the missing
   `· oculto / visível` suffix already say the switch is off. */
@keyframes stay-flash {
  0%, 100% { background-color: transparent; }
  50% { background-color: var(--color-amber-200); }
}

.stay-flash {
  animation: stay-flash 1.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .stay-flash { animation: none; }
}
</style>
