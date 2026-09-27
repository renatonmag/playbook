/**
 * The Patterns whose Series comes off the `POST` rather than off the automatic `GET`.
 *
 * All of them answer about the lines a person pinned, and a `GET` carries no lines — so the
 * automatic response holds an empty Series under each of these keys on every run, forever, under
 * *the same producer key* the `POST` answers under. `PinnedLines.__str__` says `pinned` whatever the
 * lines are, deliberately, so the key does not move when they change; which means nothing but this
 * set tells the two answers apart.
 *
 * So every reader that merges the two responses has to consult it, or the empty copy shadows the
 * real one and the Pattern can only ever say "0 pontos". There are two such readers — the monitor's
 * overlay sidebar and the Log — which is why this lives here rather than in either of them. It is a
 * fact about the pipeline, not about a screen.
 *
 * What it decides is *which response a Series comes from*, never whether it is drawn:
 *
 * - `line-relations` is in the set although it has no entry in `OVERLAYS` — it is read in the Log.
 * - `leg-target` is there on the same terms and for the same two reasons: it is downstream of the
 *   lines, so a `GET` cannot fill it, and it is read in the Log rather than drawn.
 * - `trend-relations` is there on both counts — it is the sloped twin, and it is read the same way.
 *
 * What is **not** in the set is worth one line, because it looks like an omission and is the opposite.
 * `average-relations`, `average-respect` and `average-target` ask these same questions of a moving
 * average the engine computes, so the `GET` answers them in full on every run and dropping its copy
 * would throw away the only one there is. Two of those three carry a producer name of their own
 * purely so that this set can tell them apart from the pinned-line Series they otherwise *are* —
 * `average-respect` from `line-respect`, `average-target` from `leg-target`, both subclasses with no
 * body, each argued where it is declared. What that costs is the `close` kind, which needs a ladder
 * only a body carries; the Log states it where a reader would notice.
 *
 * `line-respect` and `leg-target` each cover **two** Series, because the pipeline declares both
 * Patterns twice: once over the levels and once over the sloped lines. One name, one `OVERLAYS`
 * entry, two rows in the sidebar — which is right rather than merely convenient, since a respect
 * group is the same thing whichever kind of line it was held against, and `LineRespectOverlay` draws
 * its pills in pixels beside the run rather than at the line's price.
 *
 * Keyed by the class part of a producer, as `OVERLAYS` and `LOGGED` are — run a key through
 * `producerName` before asking.
 */
export const MANUAL = new Set([
  'leg-target',
  'line-relations',
  'line-respect',
  'trend-relations',
])

/**
 * The Series the automatic run answers **incompletely**, and which a `Calcular` answers better.
 *
 * A third case, and it took a third Series to find it. `MANUAL` above is all-or-nothing by
 * construction: every member is downstream of the pinned lines and nothing else, so without lines
 * the `GET`'s copy is empty and dropping it loses nothing. `bars` is the opposite — both runs
 * compute the same thing, so the first one wins and the entry never moves.
 *
 * `leg-recap` is neither. Four of its six readings — the leg, its `reach`, its `measured`
 * retracement, and the two average targets — are computed from closes this server already holds, so
 * the `GET` fills them on every run. Two of them, `levels` and `trends`, are the pinned lines' and
 * wait. Named in `MANUAL` the whole row would be behind a button that is about lines; left
 * unnamed, the `GET`'s partial copy would claim the key and shadow the complete one forever, which
 * is the failure `MANUAL` exists to prevent. So: **show the automatic copy until the manual one
 * exists, then prefer the manual one.**
 *
 * What that costs is one thing `MANUAL` does not, and it is worth stating: a member here **moves
 * position** when a `Calcular` lands, out of the automatic block and into the manual one. First-wins
 * exists precisely to stop an entry jumping under a reader, and this is the exception to it. Taken
 * because a `Calcular` is a deliberate act, and the alternative is a row saying a leg reached no
 * line while the line sits on the chart.
 *
 * Read by the Log and by the monitor panel's session lines — two readers, and they apply the rule
 * at different shapes. `PatternLog.entries` is building a picker, so it drops a `PARTIAL` producer
 * from the automatic list when the manual one carries the same key; `monitor.vue`'s `recapReadings`
 * wants one named Series, so it takes the manual copy when there is one and the automatic copy
 * otherwise. Same rule, and both turn on the manual run having **answered the key** rather than on
 * how many Points came back.
 *
 * The overlay sidebar is the one reader that does not consult this set, and splits on `MANUAL`
 * alone — which is right: this Series draws nothing and has no `OVERLAYS` entry to reach either
 * way. The split that matters here is about reading rows, not about drawing.
 */
export const PARTIAL = new Set(['leg-recap'])
