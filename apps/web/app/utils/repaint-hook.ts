import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts'

/**
 * A primitive that draws nothing and says when the chart drew: its renderer's `draw` is a callback.
 *
 * For DOM laid over the pane that has to stay registered with the canvas — today, the tags. Those
 * are `div`s positioned from `timeToCoordinate` and `priceToCoordinate`, and every one of those
 * numbers changes whenever the chart paints something new: a pan, a zoom, a resize, a tick that
 * moves the autoscaled price range. The library has events for the first three and **none for the
 * last** — a price scale that rescales itself under a live bar says nothing — so a list of
 * subscriptions would be a list with a hole in it, and the divs would drift off their bars the
 * first time the market moved the scale.
 *
 * A repaint is the one thing every one of those cases has in common, and a primitive is told about
 * every repaint by being asked to draw. So the question "did the coordinates change" is answered by
 * the chart itself, at exactly the moments it could have — no polling, no event list to keep
 * complete. The callback is the caller's to keep cheap: it runs inside the paint.
 */
export class RepaintHook implements ISeriesPrimitive<Time> {
  private readonly views: readonly IPrimitivePaneView[]

  constructor(onRepaint: () => void) {
    const renderer: IPrimitivePaneRenderer = { draw: onRepaint }
    this.views = [{
      // Bottom, and drawing nothing: where it sits on the pane changes nothing but when it is asked.
      zOrder: (): PrimitivePaneViewZOrder => 'bottom',
      renderer: () => renderer,
    }]
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
}
