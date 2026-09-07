/**
 * Lo que fija este suite (lib/ia-formularios.ts):
 *   · "año" con eñe y los números de la IA llegan al form como strings;
 *   · lo vacío se OMITE (aplicarSugerencia no lo toca);
 *   · el titular de la cédula se ofrece como cliente salvo que sea la agencia;
 *   · el chat pegado resuelve el auto de interés contra el stock;
 *   · el seguimiento propuesto va al final de las notas, una sola vez;
 *   · una visita arma el datetime-local; una tarea prefija "Hora: HH:MM. ".
 */
import { describe, it, expect } from 'vitest'
import {
  sugerenciaVehiculo, titularDe, sugerenciaCliente, sugerenciaInteresado,
  textoSeguimiento, notasConSeguimiento, sugerenciaVisita, sugerenciaTarea,
  descripcionConHora, normalizarHora, aplicarSugerenciaConDefaults,
} from '@/lib/ia-formularios'
import { VEHICULO_FORM_VACIO } from '@/lib/alta'
import { aplicarSugerencia } from '@/lib/ia'

describe('sugerenciaVehiculo + titularDe', () => {
  const doc = {
    tipo_documento: 'cedula', marca: ' Toyota ', modelo: 'Hilux SRX', 'año': 2021, anio_modelo: 2022,
    dominio: 'ah 204 ez', color: 'Blanco', numero_motor: '2GD123', numero_chasis: null,
    titular_nombre: 'GÓMEZ Juan', titular_dni: '12.345.678', titular_cuil: '20-12345678-3',
    titular_direccion: 'Av. Siempreviva 742', confianza: 0.9,
  }

  it('mapea a las claves del alta como strings y omite lo vacío', () => {
    const s = sugerenciaVehiculo(doc)
    expect(s).toEqual({
      marca: 'Toyota', modelo: 'Hilux SRX', 'año': '2021', dominio: 'ah 204 ez',
      color: 'Blanco', numero_motor: '2GD123',
    })
    expect('numero_chasis' in s).toBe(false)
    // Encaja con el alta: aplicarSugerencia normaliza el dominio.
    const { form, camposIa } = aplicarSugerencia(VEHICULO_FORM_VACIO, s)
    expect(form.dominio).toBe('AH204EZ')
    expect(form['año']).toBe('2021')
    expect(camposIa.size).toBe(6)
  })

  it('cae a anio_modelo si no hay año', () => {
    expect(sugerenciaVehiculo({ anio_modelo: 2020 })['año']).toBe('2020')
    expect(sugerenciaVehiculo({ 'año': 0 })['año']).toBeUndefined()
  })

  it('el titular sale con dni/cuil sólo dígitos; la agencia no es titular', () => {
    expect(titularDe(doc)).toEqual({
      nombre: 'GÓMEZ Juan', dni: '12345678', cuil: '20123456783', direccion: 'Av. Siempreviva 742',
    })
    expect(titularDe(doc, 'Rena Autos')).not.toBeNull()
    expect(titularDe({ ...doc, titular_nombre: 'RENA AUTOS S.A.' }, 'Rena Autos')).toBeNull()
    expect(titularDe({ titular_nombre: '  ' })).toBeNull()
  })
})

describe('sugerenciaCliente', () => {
  it('nombre, dni, cuil, fecha y domicilio → direccion', () => {
    expect(sugerenciaCliente({
      nombre: 'PÉREZ Juan', dni: '30111222', cuil: null, fecha_nacimiento: '12/05/1985',
      sexo: 'M', domicilio: 'Calle 1 123, La Plata',
    })).toEqual({
      nombre: 'PÉREZ Juan', dni: '30111222', fecha_nacimiento: '12/05/1985', direccion: 'Calle 1 123, La Plata',
    })
  })

  it('arma el nombre desde apellido + nombres si no viene armado', () => {
    expect(sugerenciaCliente({ apellido: 'pérez', nombres: 'Juan' }).nombre).toBe('PÉREZ Juan')
  })
})

describe('sugerenciaInteresado', () => {
  const stock = [
    { id: 1, marca: 'Volkswagen', modelo: 'Golf GTI', 'año': 2019, estado: 'publicado' },
    { id: 2, marca: 'Toyota', modelo: 'Hilux', 'año': 2021, estado: 'publicado' },
  ]

  it('llena el form y resuelve el auto de interés contra el stock', () => {
    const { campos, seguimiento } = sugerenciaInteresado({
      nombre: 'Marcos', telefono: '11 5555 1234', fuente: 'instagram',
      marca_buscada: 'VW', modelo_buscado: 'Golf', 'año_min': 2018, 'año_max': null,
      km_max: 80000, presupuesto: 15000, forma_pago: 'señado', notas: 'Quiere verlo el sábado',
      resumen: 'Preguntó por el Golf, pidió fotos del interior.',
      proximo_paso: 'Mandarle las fotos', fecha_sugerida: '2026-09-08',
    }, stock)
    expect(campos).toEqual({
      nombre: 'Marcos', telefono: '11 5555 1234', fuente: 'instagram', vehicle_id: '1',
      marca_buscada: 'VW', modelo_buscado: 'Golf', 'año_min': '2018', km_max: '80000',
      presupuesto: '15000', forma_pago: 'señado', notas: 'Quiere verlo el sábado',
    })
    expect(seguimiento).toEqual({
      resumen: 'Preguntó por el Golf, pidió fotos del interior.',
      proximo_paso: 'Mandarle las fotos', fecha_sugerida: '2026-09-08',
    })
  })

  it('sin auto en el stock no inventa vehicle_id; sin resumen no hay seguimiento', () => {
    const { campos, seguimiento } = sugerenciaInteresado({ nombre: 'Ana', modelo_buscado: 'Corolla' }, stock)
    expect(campos).toEqual({ nombre: 'Ana', modelo_buscado: 'Corolla' })
    expect(seguimiento).toBeNull()
  })
})

describe('seguimiento → notas', () => {
  const seg = { resumen: 'Pidió fotos', proximo_paso: 'Mandarlas', fecha_sugerida: '2026-09-08' }

  it('arma la línea con lo que hay', () => {
    expect(textoSeguimiento(seg)).toBe('Seguimiento: Pidió fotos — Próximo paso: Mandarlas (2026-09-08)')
    expect(textoSeguimiento({ resumen: 'Pidió fotos', proximo_paso: '', fecha_sugerida: '' })).toBe('Seguimiento: Pidió fotos')
    expect(textoSeguimiento({ resumen: '', proximo_paso: '', fecha_sugerida: '2026-09-08' })).toBe('Próximo contacto: 2026-09-08')
    expect(textoSeguimiento(null)).toBe('')
  })

  it('va al final de las notas, una sola vez', () => {
    const una = notasConSeguimiento('Quiere verlo el sábado', seg)
    expect(una).toBe('Quiere verlo el sábado\nSeguimiento: Pidió fotos — Próximo paso: Mandarlas (2026-09-08)')
    expect(notasConSeguimiento(una, seg)).toBe(una)
    expect(notasConSeguimiento('', seg)).toBe(textoSeguimiento(seg))
    expect(notasConSeguimiento('  hola ', null)).toBe('hola')
  })
})

describe('sugerenciaVisita', () => {
  it('arma el datetime-local y pasa las advertencias', () => {
    const { campos, advertencias } = sugerenciaVisita({
      tipo: 'visita', vehicle_id: 2, interesado_id: 7, fecha: '2026-09-08', hora: '15:00',
      notas: 'Viene con la señora', advertencias: ['Hay otra visita a esa hora'],
    })
    expect(campos).toEqual({ vehicle_id: '2', interesado_id: '7', fecha: '2026-09-08T15:00', notas: 'Viene con la señora' })
    expect(advertencias).toEqual(['Hay otra visita a esa hora'])
  })

  it('sin hora asume 10:00 y avisa; interesado nuevo avisa', () => {
    const { campos, advertencias } = sugerenciaVisita({
      tipo: 'visita', vehicle_id: 2, interesado_nombre_nuevo: 'Juan', fecha: '2026-09-08',
    })
    expect(campos.fecha).toBe('2026-09-08T10:00')
    expect(campos.interesado_id).toBeUndefined()
    expect(advertencias.some(a => a.includes('"Juan"'))).toBe(true)
    expect(advertencias.some(a => a.includes('10:00'))).toBe(true)
  })

  it('fecha inválida → sin fecha', () => {
    expect(sugerenciaVisita({ tipo: 'visita', fecha: 'mañana' }).campos.fecha).toBeUndefined()
  })
})

describe('sugerenciaTarea', () => {
  const EQUIPO = ['rena', 'fran']

  it('prefija la hora en la descripción y valida el asignado contra el equipo', () => {
    const { campos, advertencias } = sugerenciaTarea({
      tipo: 'tarea', titulo: 'Lavar el Golf', descripcion: 'Antes de la visita', hora: '9:30',
      tipo_tarea: 'lavado', prioridad: 'alta', asignado: 'Fran', vehicle_id: 1, fecha_vencimiento: '2026-09-08',
    }, EQUIPO)
    expect(campos).toEqual({
      titulo: 'Lavar el Golf', descripcion: 'Hora: 09:30. Antes de la visita', tipo: 'lavado',
      prioridad: 'alta', asignado: 'fran', vehicle_id: '1', fecha_vencimiento: '2026-09-08',
    })
    expect(advertencias).toEqual([])
  })

  it('asignado desconocido: se omite y se avisa; cae a `fecha` si no hay fecha_vencimiento', () => {
    const { campos, advertencias } = sugerenciaTarea({ tipo: 'tarea', titulo: 'X', asignado: 'juan', fecha: '2026-09-09' }, EQUIPO)
    expect(campos.asignado).toBeUndefined()
    expect(campos.fecha_vencimiento).toBe('2026-09-09')
    expect(advertencias[0]).toContain('"juan"')
  })
})

describe('descripcionConHora / normalizarHora', () => {
  it('normaliza y no duplica', () => {
    expect(normalizarHora('9:5')).toBe('09:05')
    expect(normalizarHora('25:00')).toBe('')
    expect(normalizarHora(null)).toBe('')
    expect(descripcionConHora('15:00', 'Llamar')).toBe('Hora: 15:00. Llamar')
    expect(descripcionConHora('15:00', '')).toBe('Hora: 15:00.')
    expect(descripcionConHora('15:00', 'Hora: 15:00. Llamar')).toBe('Hora: 15:00. Llamar')
    expect(descripcionConHora(null, 'Llamar')).toBe('Llamar')
  })
})

describe('aplicarSugerenciaConDefaults', () => {
  const form = { fuente: 'otro', forma_pago: 'contado', nombre: '' }

  it('un select en su default cuenta como vacío; uno cambiado a mano no', () => {
    const a = aplicarSugerenciaConDefaults(form, { fuente: 'instagram', nombre: 'Ana' }, { fuente: 'otro', forma_pago: 'contado' })
    expect(a.form).toEqual({ fuente: 'instagram', forma_pago: 'contado', nombre: 'Ana' })
    expect(Array.from(a.camposIa).sort()).toEqual(['fuente', 'nombre'])

    const tocado = { ...form, fuente: 'referido' }
    const b = aplicarSugerenciaConDefaults(tocado, { fuente: 'instagram' }, { fuente: 'otro', forma_pago: 'contado' })
    expect(b.form.fuente).toBe('referido')
    expect(b.camposIa.size).toBe(0)
  })
})
