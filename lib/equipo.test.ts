/**
 * El equipo dinámico. El test que importa es el primero: SIN la tabla `equipo`,
 * todo tiene que quedar exactamente como estaba hardcodeado en TareasClient y en
 * el tablero (rena/fran/marshiot, con marshiot destacado y primero).
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EQUIPO, DEFAULT_ASSIGNEE, DEFAULT_DESTACADOS, PALETA_EQUIPO,
  destacadosClaves, equipoFromRows, resolveDefaultAssignee, seccionesEquipo,
  ordenSecciones, miembroPorClave,
} from './equipo'

describe('fallback sin tabla', () => {
  it('equipoFromRows vacío ⇒ rena/fran/marshiot con sus colores de siempre', () => {
    for (const rows of [[], [{ clave: 'rena', activo: 0 }], [{ activo: 1 }]]) {
      expect(equipoFromRows(rows)).toEqual(DEFAULT_EQUIPO)
    }
    expect(DEFAULT_EQUIPO.map(m => m.clave)).toEqual(['rena', 'fran', 'marshiot'])
    expect(DEFAULT_EQUIPO.map(m => m.label)).toEqual(['Rena', 'Fran', 'Marshiot'])
    // Badges tinted (idioma de los Badge de estado), avatares sólidos: un
    // círculo de 20px con tinte al 10% es ilegible. Rena conserva el inverso.
    expect(DEFAULT_EQUIPO.map(m => m.badge)).toEqual([
      'bg-foreground text-background', PALETA_EQUIPO[1].badge, PALETA_EQUIPO[0].badge,
    ])
    expect(DEFAULT_EQUIPO.map(m => m.avatar)).toEqual([
      'bg-foreground text-background', 'bg-blue-600 text-white', 'bg-violet-600 text-white',
    ])
  })
  it('el asignado por defecto es rena y el orden de secciones marshiot, rena, fran', () => {
    const def = resolveDefaultAssignee({}, DEFAULT_EQUIPO)
    expect(def).toBe(DEFAULT_ASSIGNEE)
    const dest = destacadosClaves({}, DEFAULT_EQUIPO, def)
    expect(dest).toEqual(DEFAULT_DESTACADOS)
    expect(seccionesEquipo(DEFAULT_EQUIPO, def, dest).map(m => m.clave)).toEqual(['marshiot'])
    expect(ordenSecciones(DEFAULT_EQUIPO, def, dest)).toEqual(['marshiot', 'rena', 'fran'])
  })
  it('fran es asignable (la semántica real de is_assignee) pero NO destacado', () => {
    expect(DEFAULT_EQUIPO.find(m => m.clave === 'fran')!.isAssignee).toBe(true)
    expect(destacadosClaves({}, DEFAULT_EQUIPO, 'rena')).not.toContain('fran')
  })
})

describe('destacadosClaves', () => {
  it('lee el CSV de config, filtra a miembros existentes y excluye el default', () => {
    expect(destacadosClaves({ tablero_destacados: 'fran, marshiot, fantasma, rena' }, DEFAULT_EQUIPO, 'rena'))
      .toEqual(['fran', 'marshiot'])
  })
  it('clave vacía o ausente ⇒ fallback marshiot (si existe en el equipo)', () => {
    expect(destacadosClaves({ tablero_destacados: '  ' }, DEFAULT_EQUIPO, 'rena')).toEqual(['marshiot'])
    expect(destacadosClaves(undefined, DEFAULT_EQUIPO, 'rena')).toEqual(['marshiot'])
    // Un equipo sin marshiot (p.ej. la instancia de Tincho) arranca sin destacados.
    const otro = equipoFromRows([{ id: 1, clave: 'tincho', activo: 1 }])
    expect(destacadosClaves({}, otro, 'tincho')).toEqual([])
  })
})

describe('equipoFromRows con tabla', () => {
  const rows = [
    { id: 3, clave: 'marshiot', display_name: 'Marshiot', is_assignee: 1, activo: 1 },
    { id: 1, clave: 'rena', display_name: 'Rena', is_assignee: 1, activo: 1 },
    { id: 2, clave: 'nacho', is_assignee: 1, activo: 1 },
    { id: 4, clave: 'negocio', display_name: 'Negocio', is_assignee: 0, activo: 1 },
    { id: 5, clave: 'exempleado', display_name: 'Ex', is_assignee: 1, activo: 0 },
  ]
  it('sólo activos, en orden de id (la tabla no tiene columna orden)', () => {
    expect(equipoFromRows(rows).map(m => m.clave)).toEqual(['rena', 'nacho', 'marshiot', 'negocio'])
  })
  it('las claves conocidas conservan su color exacto; el resto va por paleta cíclica', () => {
    const eq = equipoFromRows(rows)
    expect(eq.find(m => m.clave === 'rena')!.badge).toBe('bg-foreground text-background')
    expect(eq.find(m => m.clave === 'marshiot')!.badge).toBe(PALETA_EQUIPO[0].badge)
    expect(eq.find(m => m.clave === 'marshiot')!.avatar).toBe('bg-violet-600 text-white')
    // nacho es el índice 1 de la lista → segundo color de la paleta.
    expect(eq.find(m => m.clave === 'nacho')!.badge).toBe(PALETA_EQUIPO[1].badge)
    expect(eq.find(m => m.clave === 'negocio')!.badge).toBe(PALETA_EQUIPO[3].badge)
  })
  it('sin display_name el label es la clave capitalizada', () => {
    expect(equipoFromRows(rows).find(m => m.clave === 'nacho')!.label).toBe('Nacho')
  })
  it('is_assignee ausente cuenta como asignable (fila vieja sin la columna)', () => {
    expect(equipoFromRows([{ id: 1, clave: 'x', activo: 1 }])[0].isAssignee).toBe(true)
    expect(equipoFromRows([{ id: 1, clave: 'x', activo: 1, is_assignee: '0' }])[0].isAssignee).toBe(false)
  })
  it('claves repetidas: gana la primera', () => {
    const eq = equipoFromRows([
      { id: 1, clave: 'rena', display_name: 'Rena', activo: 1 },
      { id: 2, clave: 'rena', display_name: 'Otro', activo: 1 },
    ])
    expect(eq).toHaveLength(1)
    expect(eq[0].label).toBe('Rena')
  })
})

describe('resolveDefaultAssignee', () => {
  const equipo = equipoFromRows([
    { id: 1, clave: 'ana', is_assignee: 1, activo: 1 },
    { id: 2, clave: 'beto', is_assignee: 1, activo: 1 },
  ])
  it('usa el de config cuando existe en el equipo', () => {
    expect(resolveDefaultAssignee({ default_assignee: 'beto' }, equipo)).toBe('beto')
  })
  it('si apunta a alguien que no está, cae al primero del equipo', () => {
    expect(resolveDefaultAssignee({ default_assignee: 'fantasma' }, equipo)).toBe('ana')
    expect(resolveDefaultAssignee({}, equipo)).toBe('ana')
  })
  it('con equipo vacío devuelve rena en vez de undefined', () => {
    expect(resolveDefaultAssignee({}, [])).toBe(DEFAULT_ASSIGNEE)
  })
})

describe('secciones y orden con equipo custom', () => {
  const equipo = equipoFromRows([
    { id: 1, clave: 'ana', is_assignee: 1, activo: 1 },
    { id: 2, clave: 'beto', is_assignee: 1, activo: 1 },
    { id: 3, clave: 'caja', is_assignee: 0, activo: 1 },
    { id: 4, clave: 'dani', is_assignee: 1, activo: 1 },
  ])
  it('las secciones salen de la config, en su orden; el resto después', () => {
    const dest = destacadosClaves({ tablero_destacados: 'beto,dani' }, equipo, 'ana')
    expect(seccionesEquipo(equipo, 'ana', dest).map(m => m.clave)).toEqual(['beto', 'dani'])
    expect(ordenSecciones(equipo, 'ana', dest)).toEqual(['beto', 'dani', 'ana', 'caja'])
  })
  it('nadie queda afuera del orden aunque el default no esté en el equipo', () => {
    expect(ordenSecciones(equipo, 'fantasma', []).sort()).toEqual(['ana', 'beto', 'caja', 'dani'])
  })
})

describe('miembroPorClave', () => {
  it('matchea sin importar mayúsculas y devuelve null para lo desconocido', () => {
    expect(miembroPorClave(DEFAULT_EQUIPO, 'MARSHIOT')?.label).toBe('Marshiot')
    expect(miembroPorClave(DEFAULT_EQUIPO, ' rena ')?.label).toBe('Rena')
    expect(miembroPorClave(DEFAULT_EQUIPO, 'equipo')).toBe(null)
    expect(miembroPorClave(DEFAULT_EQUIPO, null)).toBe(null)
    expect(miembroPorClave(DEFAULT_EQUIPO, '')).toBe(null)
  })
})
