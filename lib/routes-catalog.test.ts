/**
 * El catálogo de rutas y la forma de las claves son el contrato entre el proxy
 * (/api/db/[table]) y los forms de configuración. Si esto se afloja, el
 * dashboard deja escribir en `equipo` una ruta que el bot no sabe despachar o
 * una clave que después no matchea con tareas.asignado.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAVE_RE, ROUTES_CATALOG,
  isValidClave, isRouteKey, isAllRoutes, parseRoutesCsv, routesError, routesToCsv,
} from './routes-catalog'

describe('isValidClave', () => {
  it('acepta minúsculas, dígitos y guión bajo', () => {
    expect(isValidClave('rena')).toBe(true)
    expect(isValidClave('caja_chica')).toBe(true)
    expect(isValidClave('cuenta_2')).toBe(true)
  })
  it('rechaza mayúsculas, espacios, acentos, guiones y arranque no alfabético', () => {
    for (const bad of ['Rena', 'caja chica', 'niño', 'caja-chica', '2cuentas', '_x', '', 'ñ']) {
      expect(isValidClave(bad), bad).toBe(false)
    }
  })
  it('rechaza lo que no es string', () => {
    expect(isValidClave(null)).toBe(false)
    expect(isValidClave(7)).toBe(false)
    expect(isValidClave(undefined)).toBe(false)
  })
  it('la regex está anclada de punta a punta', () => {
    // Sin ^…$ "Caja rena" pasaría por contener una parte válida.
    expect(CLAVE_RE.test('Caja rena')).toBe(false)
    expect(CLAVE_RE.source).toBe('^[a-z][a-z0-9_]*$')
  })
})

describe('parseRoutesCsv', () => {
  it('parte por coma y limpia espacios y vacíos', () => {
    expect(parseRoutesCsv('stock, tareas ,,finanzas')).toEqual(['stock', 'tareas', 'finanzas'])
  })
  it('devuelve [] para no-strings', () => {
    expect(parseRoutesCsv(null)).toEqual([])
    expect(parseRoutesCsv(['stock'])).toEqual([])
  })
})

describe('routesError', () => {
  it('acepta "all" en cualquier caseo y con espacios', () => {
    expect(routesError('all')).toBeNull()
    expect(routesError(' ALL ')).toBeNull()
    expect(isAllRoutes('All')).toBe(true)
  })
  it('acepta un CSV cuyos items están todos en el catálogo', () => {
    expect(routesError('stock,tareas,finanzas')).toBeNull()
    expect(routesError('stock, tareas')).toBeNull()
    expect(routesError(ROUTES_CATALOG.join(','))).toBeNull()
  })
  it('rechaza cualquier item fuera del catálogo y lo nombra', () => {
    const err = routesError('stock,ventas')
    expect(err).toContain('"ventas"')
    expect(err).toContain('stock')
    // El item válido de la misma lista no se reporta como error.
    expect(err).not.toContain('"stock"')
  })
  it('rechaza "all" mezclado con rutas: o todo, o una lista', () => {
    expect(routesError('all,stock')).not.toBeNull()
  })
  it('trata null/undefined/"" como no seteado (columna opcional)', () => {
    expect(routesError(null)).toBeNull()
    expect(routesError(undefined)).toBeNull()
    expect(routesError('')).toBeNull()
  })
  it('rechaza un CSV que sólo tiene comas', () => {
    expect(routesError(',,')).not.toBeNull()
  })
  it('rechaza lo que no es string', () => {
    expect(routesError(['stock'])).not.toBeNull()
    expect(routesError(1)).not.toBeNull()
  })
})

describe('routesToCsv', () => {
  it('normaliza: sin espacios, sin repetidos, sin vacíos', () => {
    expect(routesToCsv([' stock ', 'tareas', 'stock', ''])).toBe('stock,tareas')
  })
})

describe('ROUTES_CATALOG', () => {
  it('tiene las 11 rutas del bot, sin repetidos', () => {
    expect(ROUTES_CATALOG).toHaveLength(11)
    expect(new Set(ROUTES_CATALOG).size).toBe(11)
    expect(ROUTES_CATALOG.every(isValidClave)).toBe(true)
  })
  it('"all" no es una ruta del catálogo, es el sentinela', () => {
    expect(isRouteKey('all')).toBe(false)
  })
})
