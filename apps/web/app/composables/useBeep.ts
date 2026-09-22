/**
 * A sound the page makes 25 seconds before every five-minute clock mark, so a bar closing is
 * something you can hear while looking somewhere else.
 *
 * It is a wall clock and nothing more. It does not read the feed, the loaded window or the
 * selected timeframe: the mark it counts to is the one the exchange's bars land on, and that is
 * true whether or not the socket is connected and whether the chart is drawing `5m` or `1h`. The
 * cost is stated plainly — on `1h` it still speaks every five minutes, because the thing it warns
 * about is the five-minute bar, and someone watching the hourly chart who does not want that turns
 * it off.
 *
 * Two pitches, one distinction: the mark that is also the top of the hour gets the low tone, every
 * other mark the high one. Three tones a second apart per event, because one is easy to miss.
 *
 * The schedule is a single timeout re-armed from the wall clock after each event, not a repeating
 * interval. An interval accumulates every millisecond the browser is late and never gives one back;
 * recomputing the target means a late fire is late once. The same recomputation is what makes a
 * laptop waking from sleep harmless — the timeout that fires hours after its moment is dropped
 * rather than sounded, and the next one is armed from the clock as it is now.
 *
 * What it cannot fix: a tab in the background has its timers throttled to roughly once a minute, so
 * a warning can arrive after the bar it was warning about. The monitor is a foreground surface and
 * that is the case worth being right for.
 */
export function useBeep() {
  /** The high tone: every five-minute mark that is not the hour. */
  const BEEP_HZ = 880

  /** The low tone: the mark that is the top of the hour. */
  const BOOP_HZ = 440

  const MARK_MS = 5 * 60 * 1000

  /** How far ahead of the mark to speak. Long enough to act on, short enough to still be about it. */
  const LEAD_MS = 25_000

  /** Past this much lateness the moment has gone, and sounding it would say something untrue. */
  const STALE_MS = 2_000

  const on = ref(false)

  /**
   * One context for the life of the alarm, created on the click that starts it.
   *
   * Both halves of that matter. A browser will not let audio start without a gesture, and the click
   * is the gesture — constructing it at setup gives a context that is born suspended. And it is one
   * context rather than one per tone because contexts are a capped resource: three tones every five
   * minutes would exhaust the cap inside a session and start throwing. The oscillator and gain
   * below *are* per tone; those are the disposable half.
   */
  let ctx: AudioContext | null = null

  /** The armed wait for the next mark. */
  let timer: ReturnType<typeof setTimeout> | null = null

  /** The second and third tones of the current event, still in flight. */
  let tones: ReturnType<typeof setTimeout>[] = []

  function tone(hz: number) {
    const audio = ctx
    if (!audio) return

    // A kept context can be suspended out from under us — a tab left alone long enough, a device
    // that slept. Resuming is asynchronous and this tone may be the one that is lost to it; the
    // next of the three lands.
    if (audio.state === 'suspended') void audio.resume()

    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, audio.currentTime)

    // Up over 100ms and down over the rest of the second: a square-edged gate on a sine clicks.
    gain.gain.setValueAtTime(0.01, audio.currentTime)
    gain.gain.linearRampToValueAtTime(0.5, audio.currentTime + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.9)

    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 1)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }

  /**
   * The next moment to speak: the coming five-minute mark less the lead, or the one after it when
   * that moment has already passed.
   */
  function nextAlert(now: number) {
    const alert = Math.ceil(now / MARK_MS) * MARK_MS - LEAD_MS
    return alert <= now ? alert + MARK_MS : alert
  }

  function arm() {
    const at = nextAlert(Date.now())
    timer = setTimeout(() => speak(at), at - Date.now())
  }

  /**
   * `at` is passed through rather than read off the clock here, because by the time this runs the
   * clock may disagree with the moment this was armed for — and it is the moment that decides which
   * pitch is right.
   */
  function speak(at: number) {
    timer = null

    if (Date.now() - at < STALE_MS) {
      // Minute 59 at the alert time means the mark it leads is the hour.
      const hz = new Date(at).getMinutes() === 59 ? BOOP_HZ : BEEP_HZ
      tone(hz)
      tones = [setTimeout(() => tone(hz), 1000), setTimeout(() => tone(hz), 2000)]
    }

    arm()
  }

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    for (const handle of tones) clearTimeout(handle)
    tones = []
  }

  function start() {
    if (on.value) return

    // Rendered on the server too, where there is no such constructor and no one to hear it.
    if (typeof AudioContext === 'undefined') return

    ctx = new AudioContext()
    on.value = true
    arm()
  }

  /** Silences what is queued as well as what is scheduled: a click that leaves two tones coming is
   * a click that did not work. */
  function stop() {
    clear()
    on.value = false
    void ctx?.close()
    ctx = null
  }

  onScopeDispose(stop)

  return { on, start, stop }
}
