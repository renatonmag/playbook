import type { MaybeRefOrGetter } from 'vue'
import { useResizeObserver } from '@vueuse/core'

/** Where a floating bar sits inside the chart's box, or `null`/`null` for "never moved". */
export interface BarPosition {
  x: number | null
  y: number | null
}

/**
 * The grip, the drag and the clamping shared by every small bar that floats over the chart pane.
 *
 * One module rather than one copy per bar, for the reason `utils/bar-time.ts` gives about itself:
 * what is being shared here is not fifty lines of pointer arithmetic, it is the four paragraphs
 * below saying why the arithmetic is that and not something simpler. A second copy is a second
 * paragraph to keep true, and the two would disagree the first time one of them was corrected.
 *
 * The caller owns the two numbers — a bar that held its own position would spring back to the
 * middle every time it was closed and reopened — so this takes a getter for them and a callback
 * for the move, and holds nothing across a press but the drag itself.
 *
 * DOM rather than a primitive drawn on the canvas, and that is what makes it cheap: a press on a
 * bar never reaches the chart's own listeners, which are on `chartElement()`, so clicking one
 * cannot deselect what the bar is about and dragging it cannot pan the chart.
 */
export function useFloatingBar(
  position: MaybeRefOrGetter<BarPosition>,
  move: (x: number, y: number) => void,
) {
  const root = ref<HTMLElement | null>(null)

  /**
   * What a drag in progress needs: the grab's offset inside the bar, and the box to stay within.
   *
   * Both measured at the press rather than per move. The pane does not resize while a button is
   * held, and reading two rects on every `pointermove` is a layout flush per frame for an answer
   * that cannot have changed.
   */
  let drag: { dx: number, dy: number, frame: DOMRect, width: number, height: number } | null = null

  function clamp(value: number, max: number) {
    return Math.min(Math.max(value, 0), Math.max(0, max))
  }

  function onPointerDown(event: PointerEvent) {
    // The primary button only. A right-click on the grip is the browser's business.
    if (event.button !== 0) return

    const el = root.value
    const parent = el?.offsetParent
    if (!el || !(parent instanceof HTMLElement)) return

    const box = el.getBoundingClientRect()
    const frame = parent.getBoundingClientRect()
    drag = {
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      frame,
      width: box.width,
      height: box.height,
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // Otherwise the drag selects the page's text as it passes over it.
    event.preventDefault()
  }

  /**
   * Clamped to the pane, so a bar cannot be put where it can no longer be reached — there is no
   * second way to bring it back, and a bar with its actions off-screen is a bar you can only be
   * rid of by ending whatever opened it.
   */
  function onPointerMove(event: PointerEvent) {
    if (!drag) return

    move(
      clamp(event.clientX - drag.dx - drag.frame.left, drag.frame.width - drag.width),
      clamp(event.clientY - drag.dy - drag.frame.top, drag.frame.height - drag.height),
    )
  }

  function onPointerUp() {
    drag = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  /**
   * The pane got smaller: pull the bar back inside it.
   *
   * The clamp on the drag is not enough on its own, and this is the case it misses — a position is
   * kept across openings and across layouts, so a bar parked low on a tall chart is a bar off the
   * bottom of a short one, with nothing that could bring it back. The same rule applied to the same
   * two numbers, just at the other moment they can go wrong.
   *
   * Only ever pulls in, never out: a bar that fits where it is stays exactly where it was put, so a
   * window widening again does not shuffle it around.
   */
  function fit() {
    const el = root.value
    const parent = el?.offsetParent
    if (!el || !(parent instanceof HTMLElement)) return

    const { x: currentX, y: currentY } = toValue(position)
    if (currentX === null || currentY === null) return

    const x = clamp(currentX, parent.clientWidth - el.offsetWidth)
    const y = clamp(currentY, parent.clientHeight - el.offsetHeight)
    if (x !== currentX || y !== currentY) move(x, y)
  }

  /**
   * The box the bar is positioned in, taken once it exists.
   *
   * A ref filled at mount rather than the element read inline, because the observer below is set up
   * during setup — where the calling component's effect scope is — and `offsetParent` is not
   * answerable until there is a layout to ask about.
   */
  const frame = ref<HTMLElement | null>(null)

  // The chart's box is the page's panel, which a splitter drag and the window both resize.
  useResizeObserver(frame, fit)

  onMounted(() => {
    const parent = root.value?.offsetParent
    frame.value = parent instanceof HTMLElement ? parent : null
    fit()
  })

  // A drag cut short by the bar closing under the cursor — whatever opened it ended from elsewhere
  // — would otherwise leave two listeners on the window moving a component that is gone.
  onBeforeUnmount(onPointerUp)

  return { root, onPointerDown }
}
