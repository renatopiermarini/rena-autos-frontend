/**
 * Lo que fija este suite:
 *   1. el body que sale para el backend (campos por tipo, valor_usd sólo cuando
 *      el auto no tiene precio, formato) y la validación que evita el viaje;
 *   2. la traducción de los DOS formatos de error 422 — son literales tomados
 *      de rena-autos-api (tools/contratos_tools.py + utils/contratos/models.py),
 *      así que si el backend cambia el texto, acá se rompe;
 *   3. el nombre del archivo, que viene en un header latin-1 con el nombre real
 *      escondido en `filename*`.
 */
import { describe, it, expect } from 'vitest'
import {
  DOCUMENTO_FORM_VACIO, filenameDeDisposition, filenameFallback, pideValorEstimado,
  planDocumento, traducirDetalles, traducirErrorBackend, traducirFaltantes, valorDeVehiculo,
  type DocumentoForm,
} from './documentos'

const AUTO = { id: 7, marca: 'VW', modelo: 'Amarok', dominio: 'AB123CD', precio_venta_objetivo: 25000 }

const form = (over: Partial<DocumentoForm> = {}): DocumentoForm => ({
  ...DOCUMENTO_FORM_VACIO, fecha: '2026-08-25', cliente_id: '3', ...over,
})

describe('valorDeVehiculo / pideValorEstimado', () => {
  it('prefiere el precio de venta final sobre el objetivo', () => {
    expect(valorDeVehiculo({ precio_venta_final: 30000, precio_venta_objetivo: 25000 })).toBe(30000)
    expect(valorDeVehiculo(AUTO)).toBe(25000)
  })

  it('el publicado NO cuenta: es lo que se pide, no lo que se acordó', () => {
    expect(valorDeVehiculo({ precio_publicado: 26000 })).toBeNull()
  })

  it('sólo el mandato pide el valor a mano, y sólo si el auto no lo tiene', () => {
    expect(pideValorEstimado('mandato', {})).toBe(true)
    expect(pideValorEstimado('mandato', AUTO)).toBe(false)
    expect(pideValorEstimado('boleto', {})).toBe(false)
  })
})

describe('planDocumento', () => {
  it('recibo de seña: manda monto_sena, precio_total y la moneda', () => {
    const r = planDocumento(form({ tipo: 'recibo_sena', monto_sena: '2000', precio_total: '25000' }), AUTO)
    expect(r).toEqual({
      ok: true,
      body: {
        tipo: 'recibo_sena',
        vehicle_id: 7,
        cliente_id: 3,
        campos_extra: { fecha: '2026-08-25', monto_sena: 2000, precio_total: 25000, moneda: 'USD' },
        formato: 'pdf',
      },
    })
  })

  it('la seña no puede ser igual o mayor al precio (misma regla que el contrato)', () => {
    const r = planDocumento(form({ tipo: 'recibo_sena', monto_sena: '25000', precio_total: '25000' }), AUTO)
    expect(r).toEqual({ ok: false, error: 'La seña tiene que ser menor al precio total.' })
  })

  it('boleto: precio total y plazo entero de días', () => {
    const r = planDocumento(
      form({ tipo: 'boleto', precio_total: '25000', plazo_transferencia_dias: '10', moneda: 'ARS', formato: 'docx' }),
      AUTO,
    )
    expect(r.ok).toBe(true)
    expect((r as any).body.campos_extra).toEqual({
      fecha: '2026-08-25', precio_total: 25000, plazo_transferencia_dias: 10, moneda: 'ARS',
    })
    expect((r as any).body.formato).toBe('docx')
  })

  it('boleto: un plazo con decimales no es un plazo', () => {
    const r = planDocumento(form({ tipo: 'boleto', precio_total: '25000', plazo_transferencia_dias: '10.5' }), AUTO)
    expect(r.ok).toBe(false)
  })

  it('mandato con precio en la ficha: no manda valor_usd ni moneda', () => {
    const r = planDocumento(form({ tipo: 'mandato' }), AUTO)
    expect(r.ok).toBe(true)
    expect((r as any).body.campos_extra).toEqual({ fecha: '2026-08-25' })
  })

  it('mandato sin precio: exige el valor estimado y lo manda', () => {
    const sinPrecio = { id: 7, dominio: 'AB123CD' }
    expect(planDocumento(form({ tipo: 'mandato' }), sinPrecio)).toEqual({
      ok: false, error: 'El auto no tiene precio cargado: poné el valor estimado de venta.',
    })
    const r = planDocumento(form({ tipo: 'mandato', valor_usd: '18000' }), sinPrecio)
    expect((r as any).body.campos_extra.valor_usd).toBe(18000)
  })

  it('pide tipo y cliente, con el rol del tipo elegido', () => {
    expect(planDocumento(form({ tipo: '' }), AUTO)).toEqual({
      ok: false, error: 'Elegí qué documento querés generar.',
    })
    expect(planDocumento(form({ tipo: 'mandato', cliente_id: '' }), AUTO)).toEqual({
      ok: false, error: 'Elegí el dueño.',
    })
    expect(planDocumento(form({ tipo: 'boleto', cliente_id: '' }), AUTO)).toEqual({
      ok: false, error: 'Elegí el comprador.',
    })
  })
})

describe('traducirFaltantes', () => {
  it('agrupa los campos de una persona en UNA línea y manda a Clientes', () => {
    // Literal de tools/contratos_tools.py `_faltantes_persona`.
    const r = traducirFaltantes([
      'comprador.dni', 'comprador.cuil', 'comprador.domicilio',
      'comprador.estado_civil', 'comprador.ocupacion',
    ])
    expect(r.linkClientes).toBe(true)
    expect(r.titulo).toBe('Le faltan datos al cliente para poder generar el documento.')
    expect(r.items).toEqual([
      'Comprador: falta DNI, CUIL, domicilio, estado civil y ocupación.',
    ])
  })

  it('numera los compradores del boleto y separa por rol', () => {
    const r = traducirFaltantes(['comprador 1.cuil', 'comprador 2.fecha_nacimiento', 'vendedor.domicilio'])
    expect(r.items).toEqual([
      'Comprador: falta CUIL.',
      'Segundo comprador: falta fecha de nacimiento.',
      'Vendedor: falta domicilio.',
    ])
  })

  it('el mandatario NO se arregla en Clientes: sale del backend', () => {
    const r = traducirFaltantes(['mandatario.cuil', 'mandatario.domicilio'])
    expect(r.linkClientes).toBe(false)
    expect(r.items).toEqual([
      'Agencia (mandatario): falta CUIL y domicilio (se configura en el backend, no en Clientes).',
    ])
  })

  it('la parte que falta entera se dice entera', () => {
    const r = traducirFaltantes(['vendedor (nombre y datos)'])
    expect(r.items).toEqual(['Vendedor: no hay ninguno cargado para este documento.'])
  })

  it('el valor del auto manda a la ficha, no a Clientes', () => {
    const r = traducirFaltantes(['vehiculo.valor_usd (valor estimado de venta)'])
    expect(r.linkClientes).toBe(false)
    expect(r.items[0]).toContain('El auto no tiene precio cargado')
  })
})

describe('traducirDetalles', () => {
  it('la patente que falta se dice en criollo (no "Input should be a valid string")', () => {
    const r = traducirDetalles(['vehiculo.dominio: Input should be a valid string'])
    expect(r.items).toEqual(['El auto: falta la patente.'])
    expect(r.linkClientes).toBe(false)
  })

  it('el CUIL inválido ya se entiende: se conserva, atribuido a su parte', () => {
    const r = traducirDetalles([
      'comprador.cuil: Value error, CUIL/CUIT inválido: no pasa el dígito verificador (verificá los 11 dígitos)',
    ])
    expect(r.items).toEqual([
      'El comprador: el CUIL/CUIT no pasa el dígito verificador (verificá los 11 dígitos).',
    ])
    expect(r.linkClientes).toBe(true)
  })

  it('los errores del documento entero no llevan sujeto', () => {
    expect(traducirDetalles(['documento: Value error, La seña debe ser menor al precio total']).items)
      .toEqual(['La seña tiene que ser menor al precio total.'])
    expect(traducirDetalles(['documento: Value error, El mandato requiere el valor estimado de venta (valor_usd)']).items[0])
      .toContain('valor estimado de venta')
  })

  it('"Faltan datos de X: a, b" (los del model_validator) se traduce campo por campo', () => {
    const r = traducirDetalles(['documento: Value error, Faltan datos de comprador: estado_civil, ocupacion'])
    expect(r.items).toEqual(['Comprador: falta estado civil y ocupación.'])
    expect(r.linkClientes).toBe(true)
  })

  it('el dominio mal escrito y el índice del comprador del boleto', () => {
    const r = traducirDetalles([
      'vehiculo.dominio: Value error, Dominio inválido: se espera AAA999 o AA999AA',
      'compradores.1.dni: Value error, DNI inválido: debe tener 7 u 8 dígitos',
    ])
    expect(r.items).toEqual([
      'El auto: la patente está mal escrita (se espera AAA999 o AA999AA).',
      'El segundo comprador: el DNI tiene que tener 7 u 8 dígitos.',
    ])
  })

  it('un mensaje desconocido se muestra igual, no se traga', () => {
    const r = traducirDetalles(['algo.raro: Value error, se rompió todo'])
    expect(r.items).toEqual(['Se rompió todo'])
  })
})

describe('traducirErrorBackend', () => {
  it('501: la feature no está configurada en esta instancia', () => {
    const r = traducirErrorBackend(501, { error: 'documentos_no_configurado' })
    expect(r.titulo).toContain('no está configurada')
    expect(r.linkClientes).toBe(false)
  })

  it('502 del proxy: el backend no contestó', () => {
    expect(traducirErrorBackend(502, { error: 'backend_inalcanzable', message: 'ECONNREFUSED' }).titulo)
      .toContain('No se pudo hablar con el backend')
  })

  it('401: es la clave, y se dice cuál', () => {
    expect(traducirErrorBackend(401, { detail: 'Unauthorized' }).titulo).toContain('BACKEND_API_KEY')
  })

  it('422 con faltantes → la traducción de faltantes', () => {
    const r = traducirErrorBackend(422, {
      detail: { error: 'Faltan datos para generar el documento', faltantes: ['comprador.dni'] },
    })
    expect(r.items).toEqual(['Comprador: falta DNI.'])
    expect(r.linkClientes).toBe(true)
  })

  it('422 con detalles → la traducción de detalles', () => {
    const r = traducirErrorBackend(422, {
      detail: { error: 'Datos inválidos para el contrato', detalles: ['vehiculo.dominio: Input should be a valid string'] },
    })
    expect(r.items).toEqual(['El auto: falta la patente.'])
  })

  it('404 de FastAPI: el detail es un string y se muestra tal cual', () => {
    expect(traducirErrorBackend(404, { detail: 'No existe el cliente #9' }).titulo)
      .toBe('No existe el cliente #9')
  })

  it('sin nada reconocible, al menos el número', () => {
    expect(traducirErrorBackend(500, {}).titulo).toBe('No se pudo generar el documento (error 500).')
  })
})

describe('filenameDeDisposition', () => {
  // El header que manda api/documentos.py: ASCII de respaldo + UTF-8 real.
  const HEADER =
    'attachment; filename="Recibo de Se?a - P?rez - AB123CD.pdf"; ' +
    "filename*=UTF-8''Recibo%20de%20Se%C3%B1a%20-%20P%C3%A9rez%20-%20AB123CD.pdf"

  it('gana el filename* en UTF-8 (los apellidos llevan tildes)', () => {
    expect(filenameDeDisposition(HEADER, 'x.pdf')).toBe('Recibo de Seña - Pérez - AB123CD.pdf')
  })

  it('sin filename*, el ASCII entre comillas', () => {
    expect(filenameDeDisposition('attachment; filename="mandato.docx"', 'x.pdf')).toBe('mandato.docx')
  })

  it('sin header, el fallback', () => {
    expect(filenameDeDisposition(null, 'recibo_sena-AB123CD.pdf')).toBe('recibo_sena-AB123CD.pdf')
    expect(filenameDeDisposition('attachment', 'x.pdf')).toBe('x.pdf')
  })

  it('el fallback se arma con la patente y no trae caracteres raros', () => {
    expect(filenameFallback('mandato', AUTO, 'docx')).toBe('mandato-AB123CD.docx')
    expect(filenameFallback('boleto', { id: 4 }, 'pdf')).toBe('boleto-4.pdf')
  })
})
