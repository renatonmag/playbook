import type { MaybeRefOrGetter } from 'vue'

/** The panel's box in the viewport. `x`/`y` are `null` until it has been dragged once. */
export interface PanelBox {
  x: number | null
  y: number | null
  width: number
  height: number
}

/** Which grip is being pulled. There are no left or top edges — see `FloatingPanel` on why. */
export type PanelEdge = 'right' | 'bottom' | 'corner'

/**
 * Narrow enough that the panel still reads as a panel rather than as a sliver with a scrollbar.
 * The minimum height leaves the title strip plus a line or two of whatever is inside it.
 */
const MIN_WIDTH = 240
const MIN_HEIGHT = 120

/**
 * The drag, the pull and the clamping for a window framed by the viewport.
 *
 * A sibling of `useFloatingBar` rather than a generalisation of it, and the split is not tidiness:
 * that module's whole contract is `offsetParent`. It measures the parent's rect at the press,
 * clamps the drag to it, and watches it with a `useResizeObserver` so a shrinking chart pane pulls
 * the bar back in. None of those three sentences survive here — a `fixed` element's frame is the
 * viewport, which is no element, has no observer, and announces itself with `window.resize`. Add
 * that a bar has no size to manage and a window's size is half of what it is, and generalising
 * would mean a frame strategy and a resize branch threaded through every paragraph over there, to
 * serve two callers that share only the word "drag".
 *
 * What is the same is the ownership: the caller holds every number. A panel that held its own
 * would have no way to persist them, and persisting them is the point.
 */
export function useFloatingPanel(
  box: MaybeRefOrGetter<PanelBox>,
  move: (x: number, y: number) => void,
  resize: (width: number, height: number) => void,
) {
  const root = ref<HTMLElement | null>(null)

  /**
   * What a gesture in progress needs, measured once at the press.
   *
   * Once rather than per move for the reason `useFloatingBar` gives about the same field: the
   * viewport does not change size while a button is held, and reading a rect on every
   * `pointermove` is a layout flush per frame for an answer that cannot have changed.
   */
  let drag: { dx: number, dy: number, width: number, height: number } | null = null
  let pull: { edge: PanelEdge, x: number, y: number, left: number, top: number, width: number, height: number } | null = null

  function clamp(value: number, max: number) {
    return Math.min(Math.max(value, 0), Math.max(0, max))
  }

  /**
   * The frame, or `null` when the page is not being shown one.
   *
   * `documentElement` rather than `window.innerWidth`, because the layout viewport is the box the
   * panel is actually positioned in and the two disagree wherever a scrollbar or a pinch-zoom is
   * involved. The `null` is the part that earns its keep: a viewport of zero is not a very small
   * screen, it is a page nobody is looking at — an offscreen render, a hidden tab, the moment
   * before a headless window is given a size — and treating it as a size means clamping the panel
   * to nothing and, because every clamp here is written straight back to storage, keeping it there
   * after the window comes back. Better to do nothing and fit on the next event.
   */
  function frame() {
    const width = document.documentElement.clientWidth
    const height = document.documentElement.clientHeight
    return width > 0 && height > 0 ? { width, height } : null
  }

  function listen() {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onDragPointerDown(event: PointerEvent) {
    // The primary button only. A right-click on the title bar is the browser's business.
    if (event.button !== 0) return

    const el = root.value
    if (!el) return

    const rect = el.getBoundingClientRect()
    drag = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    listen()

    // Otherwise the drag selects the title and whatever else it passes over.
    event.preventDefault()
  }

  function onResizePointerDown(event: PointerEvent, edge: PanelEdge) {
    if (event.button !== 0) return

    const el = root.value
    if (!el) return

    const rect = el.getBoundingClientRect()
    pull = {
      edge,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }

    listen()
    event.preventDefault()
  }

  /**
   * Clamped to the viewport, so the panel cannot be put where it can no longer be reached. There is
   * no second way to bring it back — no list of windows, no "reset layout" — and a title bar off
   * the top of the screen is a panel you can only move again by clearing storage.
   */
  function onPointerMove(event: PointerEvent) {
    const box = frame()
    if (!box) return

    if (drag) {
      move(
        clamp(event.clientX - drag.dx, box.width - drag.width),
        clamp(event.clientY - drag.dy, box.height - drag.height),
      )
      return
    }

    if (!pull) return

    // Grown against the viewport's far edge rather than against nothing: the near edges are fixed
    // for the whole gesture, so a panel can be pulled until it meets the screen and no further,
    // and never into a size that would put its own grips off the bottom right.
    // The minimum wins over the far edge, rather than the other way round: a panel pressed against
    // the right of a narrow screen would otherwise be pulled below the width that makes it legible.
    const width = pull.edge === 'bottom'
      ? pull.width
      : Math.max(Math.min(pull.width + event.clientX - pull.x, box.width - pull.left), MIN_WIDTH)
    const height = pull.edge === 'right'
      ? pull.height
      : Math.max(Math.min(pull.height + event.clientY - pull.y, box.height - pull.top), MIN_HEIGHT)

    resize(width, height)
  }

  function onPointerUp() {
    drag = null
    pull = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  /**
   * The viewport got smaller: pull the panel back inside it.
   *
   * The clamps above are not enough on their own, and this is the case they miss — the box is kept
   * across reloads and across machines, so a panel parked in the corner of a big monitor is a panel
   * off the edge of a laptop, with nothing that could bring it back. The same rules applied to the
   * same numbers, just at the other moment they can go wrong.
   *
   * Only ever pulls in, never out: a panel that fits where it is stays exactly where it was put, so
   * a window widening again does not shuffle it around.
   *
   * The height it measures is the element's, not the stored one, because a folded panel is 25px
   * tall while remembering the height it will unfold to — clamping the stored number here would
   * shrink a panel for a viewport it is not currently occupying.
   */
  function fit() {
    const el = root.value
    const screen = frame()
    if (!el || !screen) return

    const { x, y, width, height } = toValue(box)

    const fitted = {
      width: Math.max(Math.min(width, screen.width), MIN_WIDTH),
      height: Math.max(Math.min(height, screen.height), MIN_HEIGHT),
    }
    if (fitted.width !== width || fitted.height !== height) resize(fitted.width, fitted.height)

    if (x === null || y === null) return

    const next = {
      x: clamp(x, screen.width - el.offsetWidth),
      y: clamp(y, screen.height - el.offsetHeight),
    }
    if (next.x !== x || next.y !== y) move(next.x, next.y)
  }

  // Raw rather than an observer: there is no element whose box is the frame. `useFloatingBar` has
  // one and uses it; this is the same intent through the only API the viewport offers.
  onMounted(() => {
    window.addEventListener('resize', fit)
    fit()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', fit)
    // A gesture cut short by the panel unmounting would otherwise leave two listeners on the
    // window moving a component that is gone.
    onPointerUp()
  })

  return { root, onDragPointerDown, onResizePointerDown }
}
