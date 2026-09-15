/**
 * How a bar's timestamp becomes a clock reading.
 *
 * `timeZone: 'UTC'` in everything here, and it is **not** a decision to display UTC — it is what
 * makes the hour come out right in São Paulo.
 *
 * The stored timestamps fall on UTC hours 09–18, and the B3 session runs 09:00 to 18:00 São Paulo
 * time. Those two facts coexist one way only: the epoch encodes São Paulo wall time *labelled* as
 * UTC. Converting it to the reader's zone subtracts three hours from a number that is already
 * local, and the 09:00 open shows as 06:00. Formatting in UTC undoes exactly that conversion, and
 * the label becomes the trading hour.
 *
 * While that convention holds in the database this is right in any browser in the world — and it
 * is the same reading `utcDay` leans on in `two-bar-reversal.ts` and `record-bars.ts` so as not to
 * cut a session in half.
 *
 * One module rather than one copy per caller, because the paragraph above does not survive being
 * retyped: it was already written out in `pages/monitor.vue` and `pages/record-bars.vue`, and the
 * three verifiers that did not have it read three hours early for exactly as long.
 *
 * Second consequence, which `/verify` depends on: the label no longer varies with the reader's
 * clock, so it renders identically on the server and in the browser and needs no `ClientOnly`.
 */

/** The zone every bar label is formatted in. See this module's docblock for why it is `UTC`. */
export const BAR_ZONE = 'UTC'

/**
 * A bar's date and time as the trading clock read it. Unix seconds in, as every Point carries.
 *
 * Takes the seconds rather than a bar, because its callers disagree about what they hold — two
 * have a bar that the wire shape allows to be absent, one has a bare `time`. The `—` for a missing
 * bar stays at the call site, where what is on the wire is known.
 */
export function barMoment(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString('pt-BR', {
    timeZone: BAR_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
