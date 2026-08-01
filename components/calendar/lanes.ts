// Column packing for the week grid.
//
// The rule this exists to keep: N items stacked in time must be N items visible on
// screen. Before this, overlapping blocks and events shared identical absolute bounds
// and the later one simply painted over the earlier — two turnos at 10:00 rendered as
// one turno, which is exactly the double-booking the calendar is supposed to surface.

export type Span = { top: number; bottom: number }
export type Lane<T> = { item: T; lane: number; lanes: number }

/**
 * Greedy interval-graph column packing, in pixel space.
 *
 * Items that overlap form a cluster and split the column between them; items that
 * overlap nothing keep the full width. Half-open: an item starting exactly where
 * another ends does not collide with it.
 */
export function packLanes<T>(items: T[], spanOf: (t: T) => Span): Lane<T>[] {
  const sorted = items
    .map(item => ({ item, ...spanOf(item), lane: 0 }))
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom)

  const out: Lane<T>[] = []
  let cluster: typeof sorted = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const e of cluster) out.push({ item: e.item, lane: e.lane, lanes: laneEnds.length })
    cluster = []
    laneEnds = []
    clusterEnd = -Infinity
  }

  for (const e of sorted) {
    if (cluster.length && e.top >= clusterEnd) flush()
    let lane = laneEnds.findIndex(end => end <= e.top)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(e.bottom)
    } else {
      laneEnds[lane] = e.bottom
    }
    e.lane = lane
    cluster.push(e)
    clusterEnd = Math.max(clusterEnd, e.bottom)
  }
  if (cluster.length) flush()
  return out
}

/** `left`/`width` for a packed item, with a hairline gutter between lanes. */
export function laneStyle(lane: number, lanes: number) {
  const width = 100 / lanes
  return { left: `calc(${lane * width}% + 1px)`, width: `calc(${width}% - 2px)` }
}
