import { describe, it, expect } from 'vitest'
import {
  MENSAJES_CONFIG_KEY, TIPO_PLANTILLA,
  mensajesHabilitados, plantillasDe, tituloPlantilla, tagsDe, filtrarPlantillas, esLargo,
} from './mensajes'

const fila = (over: Record<string, any> = {}) => ({
  id: 1, tipo: TIPO_PLANTILLA, titulo: 'Seña', contenido: 'Hola, te paso los datos.',
  tags: null, autor: 'rena', ...over,
})

describe('mensajesHabilitados', () => {
  it('sin config_negocio cargada dice que sí (instancia de Renato pre-DDL)', () => {
    expect(mensajesHabilitados({})).toBe(true)
    expect(mensajesHabilitados(undefined)).toBe(true)
    expect(mensajesHabilitados(null)).toBe(true)
  })

  it('con config cargada y sin la clave dice que no (instancia nueva, ej. TM)', () => {
    expect(mensajesHabilitados({ nombre: 'TM Autos', branding_titulo: 'TM' })).toBe(false)
  })

  it('con la clave en "1" dice que sí', () => {
    expect(mensajesHabilitados({ nombre: 'TM', [MENSAJES_CONFIG_KEY]: '1' })).toBe(true)
    expect(mensajesHabilitados({ nombre: 'TM', [MENSAJES_CONFIG_KEY]: ' 1 ' })).toBe(true)
  })

  it('cualquier otro valor apaga la pantalla', () => {
    for (const v of ['0', '', 'true', 'si', 'no']) {
      expect(mensajesHabilitados({ nombre: 'TM', [MENSAJES_CONFIG_KEY]: v })).toBe(false)
    }
  })
})

describe('plantillasDe', () => {
  it('deja pasar SÓLO tipo=plantilla — la base del bot no se muestra acá', () => {
    const rows = [
      fila({ id: 1, titulo: 'Seña' }),
      fila({ id: 2, tipo: 'faq', titulo: 'Cómo se transfiere' }),
      fila({ id: 3, tipo: 'proceso', titulo: 'Ingreso de auto' }),
      fila({ id: 4, tipo: 'leccion_aprendida', titulo: 'No fiarse' }),
    ]
    expect(plantillasDe(rows).map(p => p.id)).toEqual([1])
  })

  it('descarta filas sin id usable o sin texto', () => {
    const rows = [
      fila({ id: null }),        // Number(null) es 0: no puede colarse como id 0
      fila({ id: '' }),
      fila({ id: 'abc' }),
      fila({ id: 0 }),
      fila({ id: 5, contenido: '   ' }),
      fila({ id: 6, contenido: null }),
      fila({ id: 7 }),
    ]
    expect(plantillasDe(rows).map(p => p.id)).toEqual([7])
  })

  it('acepta el id como TEXT, que es como lo devuelve D1', () => {
    expect(plantillasDe([fila({ id: '12' })])[0].id).toBe(12)
  })

  it('ordena alfabético por el título visible, sin importar mayúsculas ni acentos', () => {
    const rows = [
      fila({ id: 1, titulo: 'Zafra' }),
      fila({ id: 2, titulo: 'árbol' }),
      fila({ id: 3, titulo: 'Banco' }),
    ]
    expect(plantillasDe(rows).map(p => p.titulo)).toEqual(['árbol', 'Banco', 'Zafra'])
  })

  it('normaliza los vacíos a null y tolera basura', () => {
    const [p] = plantillasDe([fila({ titulo: '  ', tags: '', autor: '   ' })])
    expect(p.titulo).toBeNull()
    expect(p.tags).toBeNull()
    expect(p.autor).toBeNull()
    expect(plantillasDe(null as any)).toEqual([])
  })
})

describe('tituloPlantilla', () => {
  it('usa el título cuando está', () => {
    expect(tituloPlantilla({ titulo: 'Seña', contenido: 'texto' })).toBe('Seña')
  })

  it('sin título cae a la primera línea con contenido', () => {
    expect(tituloPlantilla({ titulo: null, contenido: '\n\n  Hola! ¿Cómo va?\nSegunda línea' }))
      .toBe('Hola! ¿Cómo va?')
  })

  it('corta la línea larga con puntos suspensivos', () => {
    const t = tituloPlantilla({ titulo: null, contenido: 'a'.repeat(200) })
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(61)
  })

  it('sin nada devuelve el placeholder', () => {
    expect(tituloPlantilla({ titulo: null, contenido: '   \n  ' })).toBe('(sin título)')
  })
})

describe('tagsDe', () => {
  it('parsea el CSV y limpia los vacíos', () => {
    expect(tagsDe({ tags: ' seña , papeles ,, ' })).toEqual(['seña', 'papeles'])
    expect(tagsDe({ tags: null })).toEqual([])
  })
})

describe('filtrarPlantillas', () => {
  const lista = plantillasDe([
    fila({ id: 1, titulo: 'Seña', contenido: 'Te reservo el auto con la seña.', tags: 'plata' }),
    fila({ id: 2, titulo: 'Turno', contenido: 'Te espero el martes.', tags: 'agenda,visita' }),
    fila({ id: 3, titulo: null, contenido: 'Buenas! Ya está publicado.' }),
  ])

  it('query vacía devuelve todo', () => {
    expect(filtrarPlantillas(lista, '   ')).toHaveLength(3)
  })

  it('busca sin acentos y sin importar mayúsculas', () => {
    expect(filtrarPlantillas(lista, 'SENA').map(p => p.id)).toEqual([1])
  })

  it('busca en el texto y en los tags, no sólo en el título', () => {
    expect(filtrarPlantillas(lista, 'martes').map(p => p.id)).toEqual([2])
    expect(filtrarPlantillas(lista, 'agenda').map(p => p.id)).toEqual([2])
  })

  it('encuentra por el título derivado de una plantilla sin título', () => {
    expect(filtrarPlantillas(lista, 'publicado').map(p => p.id)).toEqual([3])
  })
})

describe('esLargo', () => {
  it('un renglón corto no ofrece "Ver completo"', () => {
    expect(esLargo('Ya te paso los datos.')).toBe(false)
  })

  it('más de tres líneas, o mucho texto, sí', () => {
    expect(esLargo('a\nb\nc\nd')).toBe(true)
    expect(esLargo('x'.repeat(141))).toBe(true)
  })
})
