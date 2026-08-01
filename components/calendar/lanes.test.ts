import { describe, it, expect } from 'vitest'
import { packLanes, laneStyle, type Span } from './lanes'

// The invariant these guard: N items stacked in time must be N items visible on
// screen. Before packLanes existed, overlapping turnos shared identical absolute
// bounds and the later one painted over the earlier — so a double-booked morning
// looked exactly like a single appointment, on the one surface meant to catch it.

const span = (s: Span) => s
type Item = { id: string; top: number; bottom: number }

/** Packed result reduced to a comparable shape, sorted by id. */
const shape = (rows: ReturnType<typeof packLanes<Item>>) =>
  rows
    .map(r => ({ id: r.item.id, lane: r.lane, lanes: r.lanes }))
    .sort((a, b) => a.id.localeCompare(b.id))

describe('packLanes', () => {
  it('splits the column when two spans occupy the same window', () => {
    expect(shape(packLanes<Item>(
      [{ id: 'a', top: 0, bottom: 88 }, { id: 'b', top: 0, bottom: 88 }], span,
    ))).toEqual([
      { id: 'a', lane: 0, lanes: 2 },
      { id: 'b', lane: 1, lanes: 2 },
    ])
  })

  it('leaves non-overlapping spans at full width', () => {
    expect(shape(packLanes<Item>(
      [{ id: 'a', top: 0, bottom: 44 }, { id: 'b', top: 100, bottom: 144 }], span,
    ))).toEqual([
      { id: 'a', lane: 0, lanes: 1 },
      { id: 'b', lane: 0, lanes: 1 },
    ])
  })

  it('treats abutting spans as non-colliding (half-open)', () => {
    // A turno ending at 12:00 and one starting at 12:00 do not overlap. This must
    // match the half-open rule in lib/agenda.ts, which mirrors the Python backend.
    expect(shape(packLanes<Item>(
      [{ id: 'a', top: 0, bottom: 44 }, { id: 'b', top: 44, bottom: 88 }], span,
    ))).toEqual([
      { id: 'a', lane: 0, lanes: 1 },
      { id: 'b', lane: 0, lanes: 1 },
    ])
  })

  it('gives three mutually overlapping spans three lanes', () => {
    expect(shape(packLanes<Item>([
      { id: 'a', top: 0, bottom: 90 },
      { id: 'b', top: 10, bottom: 90 },
      { id: 'c', top: 20, bottom: 90 },
    ], span))).toEqual([
      { id: 'a', lane: 0, lanes: 3 },
      { id: 'b', lane: 1, lanes: 3 },
      { id: 'c', lane: 2, lanes: 3 },
    ])
  })

  it('reuses a lane once its previous occupant has ended', () => {
    expect(shape(packLanes<Item>([
      { id: 'a', top: 0, bottom: 44 },
      { id: 'b', top: 0, bottom: 132 },
      { id: 'c', top: 44, bottom: 88 },
    ], span))).toEqual([
      { id: 'a', lane: 0, lanes: 2 },
      { id: 'b', lane: 1, lanes: 2 },
      { id: 'c', lane: 0, lanes: 2 },
    ])
  })

  it('sizes clusters independently, so a busy morning does not shrink a quiet afternoon', () => {
    expect(shape(packLanes<Item>([
      { id: 'a', top: 0, bottom: 44 },
      { id: 'b', top: 0, bottom: 44 },
      { id: 'c', top: 200, bottom: 244 },
    ], span))).toEqual([
      { id: 'a', lane: 0, lanes: 2 },
      { id: 'b', lane: 1, lanes: 2 },
      { id: 'c', lane: 0, lanes: 1 },
    ])
  })

  it('keeps a transitive overlap chain in one cluster', () => {
    // a–b overlap and b–c overlap, but a–c do not. All three still share a cluster.
    expect(shape(packLanes<Item>([
      { id: 'a', top: 0, bottom: 50 },
      { id: 'b', top: 40, bottom: 100 },
      { id: 'c', top: 90, bottom: 140 },
    ], span))).toEqual([
      { id: 'a', lane: 0, lanes: 2 },
      { id: 'b', lane: 1, lanes: 2 },
      { id: 'c', lane: 0, lanes: 2 },
    ])
  })

  it('handles empty input', () => {
    expect(packLanes<Item>([], span)).toEqual([])
  })

  describe('invariants over a dense set', () => {
    const many: Item[] = Array.from({ length: 40 }, (_, i) => ({
      id: `x${i}`,
      top: (i % 7) * 15,
      bottom: (i % 7) * 15 + 60,
    }))
    const packed = packLanes(many, span)

    it('drops nothing', () => {
      expect(packed).toHaveLength(many.length)
      expect(new Set(packed.map(p => p.item.id)).size).toBe(many.length)
    })

    it('never puts two overlapping items in the same lane', () => {
      const collisions = packed.flatMap((p, i) =>
        packed.slice(i + 1).filter(q =>
          p.lane === q.lane && p.item.top < q.item.bottom && q.item.top < p.item.bottom))
      expect(collisions).toEqual([])
    })

    it('never assigns a lane index outside its cluster width', () => {
      for (const p of packed) expect(p.lane).toBeLessThan(p.lanes)
    })
  })
})

describe('laneStyle', () => {
  it('gives a single lane the full column', () => {
    expect(laneStyle(0, 1)).toEqual({ left: 'calc(0% + 1px)', width: 'calc(100% - 2px)' })
  })

  it('offsets each lane by its share of the column', () => {
    expect(laneStyle(1, 2)).toEqual({ left: 'calc(50% + 1px)', width: 'calc(50% - 2px)' })
  })
})
