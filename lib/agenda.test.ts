import { describe, it, expect } from 'vitest'
import {
  BLOCK_HOURS,
  blockConflicts,
  eventConflicts,
  inBlock,
  transferenciaBlocks,
  turnosBlocks,
  visitaConflict,
} from './agenda'
import type { CalendarBlock } from '@/components/calendar/types'

// This file guards two different things, and the difference is the point:
//
//   * `visitaConflict` is the WRITE rule. It is one half of a contract duplicated in
//     the backend (rena-autos-api `flows/agenda_rules.py`). Widening it here without
//     mirroring it there makes the dashboard reject writes the bot still accepts.
//     The tests under "write rule" assert its CURRENT, deliberately narrow scope —
//     if you are changing them, you should be changing the Python side in the same PR.
//
//   * `blockConflicts` / `eventConflicts` are the DISPLAY layer. They exist to show a
//     human every collision the calendar can see, including ones the write rule does
//     not cover. They are free to be broader, and are expected to be.

const at = (h: number, m = 0) => new Date(2026, 7, 6, h, m) // 6 Aug 2026, local
const blk = (id: number, startH: number, endH: number, title = `bloque ${id}`): CalendarBlock => ({
  id, title, start: at(startH), end: at(endH), kind: 'turno',
})

describe('inBlock (half-open: start <= t < end)', () => {
  const b = { start: at(10), end: at(12) }
  it('includes the start instant', () => expect(inBlock(at(10), b)).toBe(true))
  it('includes an instant inside', () => expect(inBlock(at(11), b)).toBe(true))
  it('excludes the end instant', () => expect(inBlock(at(12), b)).toBe(false))
  it('excludes an instant before', () => expect(inBlock(at(9, 59), b)).toBe(false))
})

describe('blockConflicts (display layer)', () => {
  it('flags both blocks when two windows overlap', () => {
    expect(Array.from(blockConflicts([blk(1, 10, 12), blk(2, 11, 13)]).keys()).sort()).toEqual([1, 2])
  })

  it('does not flag blocks that merely abut', () => {
    expect(Array.from(blockConflicts([blk(1, 10, 12), blk(2, 12, 14)]).keys())).toEqual([])
  })

  it('does not flag disjoint blocks', () => {
    expect(Array.from(blockConflicts([blk(1, 10, 12), blk(2, 15, 17)]).keys())).toEqual([])
  })

  it('flags a block fully contained in another', () => {
    expect(Array.from(blockConflicts([blk(1, 9, 18), blk(2, 11, 12)]).keys()).sort()).toEqual([1, 2])
  })

  it('names the block it collides with, so the UI can say "Choca con X"', () => {
    const map = blockConflicts([blk(1, 10, 12, 'Transferencia Amarok'), blk(2, 11, 13, 'Verificación policial')])
    expect(map.get(1)?.map(b => b.title)).toEqual(['Verificación policial'])
    expect(map.get(2)?.map(b => b.title)).toEqual(['Transferencia Amarok'])
  })

  it('lists every other block in a three-way pile-up', () => {
    const map = blockConflicts([blk(1, 10, 13), blk(2, 11, 14), blk(3, 12, 15)])
    expect(Array.from(map.values()).map(v => v.length)).toEqual([2, 2, 2])
  })

  it('returns nothing for a single block', () => {
    expect(Array.from(blockConflicts([blk(1, 10, 12)]).keys())).toEqual([])
  })
})

describe('eventConflicts (display layer)', () => {
  it('flags a visita booked inside a blocked window', () => {
    expect(Array.from(eventConflicts([{ id: 'v1', start: at(11) }], [blk(1, 10, 12)]).keys())).toEqual(['v1'])
  })

  it('flags a visita exactly at the block start', () => {
    expect(Array.from(eventConflicts([{ id: 'v1', start: at(10) }], [blk(1, 10, 12)]).keys())).toEqual(['v1'])
  })

  it('does NOT flag a visita exactly at the block end', () => {
    // Half-open, same as inBlock and the same as the Python helper.
    expect(Array.from(eventConflicts([{ id: 'v1', start: at(12) }], [blk(1, 10, 12)]).keys())).toEqual([])
  })

  it('leaves a visita outside every block alone', () => {
    expect(Array.from(eventConflicts([{ id: 'v1', start: at(9) }], [blk(1, 10, 12)]).keys())).toEqual([])
  })

  it('lists every block a visita collides with', () => {
    const map = eventConflicts([{ id: 'v1', start: at(11) }], [blk(1, 10, 12, 'A'), blk(2, 11, 13, 'B')])
    expect(map.get('v1')?.map(b => b.title)).toEqual(['A', 'B'])
  })
})

describe('block builders', () => {
  it('gives a transferencia a deep link to its own record', () => {
    const [b] = transferenciaBlocks([
      { id: 5, auto: 'Amarok', fecha_turno: '2026-08-06', horario: '10:00', estado: 'pendiente' },
    ])
    expect(b.href).toBe('/transferencias?id=5')
    expect(b.kind).toBe('transferencia')
  })

  it('skips transferencias that are done or called off', () => {
    expect(transferenciaBlocks([
      { id: 1, fecha_turno: '2026-08-06', horario: '10:00', estado: 'completada' },
      { id: 2, fecha_turno: '2026-08-06', horario: '10:00', estado: 'cancelada' },
    ])).toEqual([])
  })

  it('defaults a transferencia window to BLOCK_HOURS', () => {
    const [b] = transferenciaBlocks([
      { id: 1, fecha_turno: '2026-08-06', horario: '10:00', estado: 'pendiente' },
    ])
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(BLOCK_HOURS)
  })

  it('gives a bot-written turno NO href, because no page renders that table', () => {
    // Routing these to /transferencias sent people to a list that could not contain
    // the record — a verificación policial is not a transferencia.
    const [b] = turnosBlocks([
      { id: 9, tipo: 'verificacion_policial', fecha: '2026-08-06T11:00:00-03:00', estado: 'pendiente' },
    ])
    expect(b.kind).toBe('turno')
    expect(b.href).toBeUndefined()
  })

  it('honours a turno duracion_horas other than the default', () => {
    const [b] = turnosBlocks([
      { id: 9, tipo: 'transferencia', fecha: '2026-08-06T11:00:00-03:00', duracion_horas: 3, estado: 'pendiente' },
    ])
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(3)
  })

  it('skips turnos that are not pendiente', () => {
    expect(turnosBlocks([
      { id: 9, tipo: 'transferencia', fecha: '2026-08-06T11:00:00-03:00', estado: 'completado' },
    ])).toEqual([])
  })
})

describe('write rule vs display layer — KEEP IN SYNC boundary', () => {
  const turnoRow = [{ id: 9, tipo: 'verificacion_policial', fecha: '2026-08-06T11:00:00-03:00', estado: 'pendiente' }]

  it('visitaConflict still ignores the bot-written turnos table', () => {
    // DO NOT "fix" this test by widening visitaConflict. It mirrors
    // rena-autos-api `flows/agenda_rules.py`; widening one side alone means the
    // dashboard rejects writes the bot accepts. Change Python first, then both.
    expect(visitaConflict('2026-08-06T11:30:00-03:00', turnoRow as any)).toBeNull()
  })

  it('visitaConflict does catch an overlapping transferencia', () => {
    const conflict = visitaConflict('2026-08-06T10:30:00-03:00', [
      { id: 1, auto: 'Amarok', fecha_turno: '2026-08-06', horario: '10:00', estado: 'pendiente' },
    ])
    expect(conflict?.auto).toBe('Amarok')
  })

  it('the display layer DOES surface the visita sitting on a bot turno', () => {
    // This is the gap the calendar now covers: neither validator rejects it, so the
    // only defence is a human seeing it marked on screen.
    const blocks = turnosBlocks(turnoRow)
    const hits = eventConflicts([{ id: 'v1', start: new Date('2026-08-06T11:30:00-03:00') }], blocks)
    expect(Array.from(hits.keys())).toEqual(['v1'])
  })
})
