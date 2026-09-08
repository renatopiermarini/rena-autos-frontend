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
  DOCUMENTO_FORM_VACIO, TIPOS_DOC, TIPO_DOCUMENTO_LABEL, TIPOS_SUBIBLES, TIPO_A_COLUMNA_DOC,
  ORIGEN_LABEL, autosParaDocumentos, documentosDeVehiculo, documentosGenerados,
  filenameDeDisposition, filenameFallback, filtrarAutos, filtrarClientes, idDocumentoValido, origenLabel,
  pidePrecioTotal, pideValorEstimado, planDocumento, tamanioLegible, tipoDocumentoLabel,
  traducirDetalles, traducirErrorBackend, traducirFaltantes, traducirPreparar, valorDeVehiculo,
  type DocumentoForm, type DocumentoMeta,
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

  it('recibo de pago con precio en la ficha: manda monto_pagado, pagos_previos (0 por defecto) y moneda', () => {
    const r = planDocumento(form({ tipo: 'recibo_pago', monto_pagado: '5000' }), AUTO)
    expect(r).toEqual({
      ok: true,
      body: {
        tipo: 'recibo_pago',
        vehicle_id: 7,
        cliente_id: 3,
        campos_extra: { fecha: '2026-08-25', monto_pagado: 5000, pagos_previos: 0, moneda: 'USD' },
        formato: 'pdf',
      },
    })
  })

  it('recibo de pago: pagos previos y concepto viajan cuando se cargan', () => {
    const r = planDocumento(
      form({ tipo: 'recibo_pago', monto_pagado: '20000', pagos_previos: '5000', concepto: 'saldo total' }),
      AUTO,
    )
    expect((r as any).body.campos_extra).toEqual({
      fecha: '2026-08-25', monto_pagado: 20000, pagos_previos: 5000, concepto: 'saldo total', moneda: 'USD',
    })
  })

  it('recibo de pago sin precio en la ficha: exige el precio total y lo manda', () => {
    const sinPrecio = { id: 7, dominio: 'AB123CD' }
    expect(pidePrecioTotal('recibo_pago', sinPrecio)).toBe(true)
    expect(pidePrecioTotal('recibo_pago', AUTO)).toBe(false)
    expect(pidePrecioTotal('boleto', AUTO)).toBe(true)
    expect(planDocumento(form({ tipo: 'recibo_pago', monto_pagado: '100' }), sinPrecio)).toEqual({
      ok: false, error: 'El auto no tiene precio cargado: poné el precio total de la venta.',
    })
    const r = planDocumento(form({ tipo: 'recibo_pago', monto_pagado: '100', precio_total: '18000' }), sinPrecio)
    expect((r as any).body.campos_extra.precio_total).toBe(18000)
  })

  it('recibo de pago: el pago no puede superar el saldo (misma regla que el backend)', () => {
    const r = planDocumento(form({ tipo: 'recibo_pago', monto_pagado: '21000', pagos_previos: '5000' }), AUTO)
    expect(r.ok).toBe(false)
    expect((r as any).error).toContain('supera el saldo')
    expect(planDocumento(form({ tipo: 'recibo_pago', monto_pagado: '0' }), AUTO).ok).toBe(false)
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

  it('un dato del auto que falta prende el link a la ficha del auto', () => {
    const r = traducirFaltantes(['vehiculo.dominio'])
    expect(r.linkAuto).toBe(true)
    expect(r.linkClientes).toBe(false)
    expect(traducirFaltantes(['comprador.dni']).linkAuto).toBe(false)
  })

  it('los campos del recibo de pago tienen nombre en criollo', () => {
    expect(traducirFaltantes(['monto_pagado']).items).toEqual(['Falta el monto pagado.'])
  })
})

describe('traducirPreparar', () => {
  it('ok: true → null (no hay nada que mostrar)', () => {
    expect(traducirPreparar({ ok: true, faltantes: [], detalles: [] })).toBeNull()
  })

  it('faltantes y detalles se traducen igual que el 422', () => {
    const r = traducirPreparar({ ok: false, faltantes: ['comprador.dni'], detalles: [] })
    expect(r?.items).toEqual(['Comprador: falta DNI.'])
    expect(r?.linkClientes).toBe(true)
    const d = traducirPreparar({ ok: false, faltantes: [], detalles: ['vehiculo.dominio: Input should be a valid string'] })
    expect(d?.items).toEqual(['El auto: falta la patente.'])
    expect(d?.linkAuto).toBe(true)
  })

  it('un body sin ok no habilita Generar a ciegas', () => {
    expect(traducirPreparar({})?.titulo).toContain('no pudo verificar')
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

  it('el pago que supera el saldo (recibo de pago) se dice en criollo', () => {
    const r = traducirDetalles(['documento: Value error, El pago supera el saldo pendiente (USD 20000)'])
    expect(r.items[0]).toContain('supera el saldo')
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

describe('archivos guardados (documentos_meta)', () => {
  const DOCS: DocumentoMeta[] = [
    { id: 1, vehicle_id: 7, cliente_id: null, tipo: 'titulo', nombre: 'titulo.pdf', mime: 'application/pdf', tamanio: 2048, origen: 'whatsapp', created_at: '2026-08-01T10:00:00' },
    { id: 2, vehicle_id: 7, cliente_id: 3, tipo: 'contrato_boleto', nombre: 'Boleto.pdf', mime: 'application/pdf', tamanio: 900, origen: 'generado', created_at: '2026-08-20T10:00:00' },
    { id: 3, vehicle_id: 8, cliente_id: null, tipo: 'otro', nombre: 'x.jpg', mime: 'image/jpeg', tamanio: 3 * 1024 * 1024, origen: 'dashboard', created_at: '2026-08-15T10:00:00' },
  ]

  it('las 4 plantillas tienen "cuándo se usa" y rol; el recibo de pago es del comprador', () => {
    expect(TIPOS_DOC.map(t => t.tipo)).toEqual(['recibo_sena', 'recibo_pago', 'mandato', 'boleto'])
    expect(TIPOS_DOC.every(t => t.descripcion && t.rolCliente)).toBe(true)
    expect(TIPOS_DOC.find(t => t.tipo === 'recibo_pago')?.rolCliente).toBe('Comprador')
  })

  it('todos los tipos de la tabla tienen etiqueta; los 6 papeles mapean a su columna doc_*', () => {
    expect(Object.keys(TIPO_DOCUMENTO_LABEL)).toHaveLength(12)
    expect(Object.keys(TIPO_A_COLUMNA_DOC)).toEqual([
      'formulario_08', 'cedulas', 'titulo', 'informe_dominio', 'verificacion_policial', 'libre_deudas',
    ])
    expect(TIPOS_SUBIBLES).not.toContain('contrato_boleto')
    expect(tipoDocumentoLabel('contrato_recibo_pago')).toBe('Recibo de pago')
    expect(tipoDocumentoLabel('algo_nuevo')).toBe('algo nuevo')
    expect(tipoDocumentoLabel(null)).toBe('Otro')
  })

  it('el origen se nombra; uno desconocido se muestra crudo', () => {
    expect(Object.keys(ORIGEN_LABEL)).toEqual(['dashboard', 'whatsapp', 'generado', 'claude'])
    expect(origenLabel('whatsapp')).toBe('WhatsApp')
    expect(origenLabel('bot')).toBe('bot')
    expect(origenLabel(null)).toBe('—')
  })

  it('tamanioLegible: B / KB / MB con coma decimal', () => {
    expect(tamanioLegible(900)).toBe('900 B')
    expect(tamanioLegible(2048)).toBe('2 KB')
    expect(tamanioLegible(3 * 1024 * 1024)).toBe('3,0 MB')
    expect(tamanioLegible(1.25 * 1024 * 1024)).toBe('1,3 MB')
    expect(tamanioLegible(null)).toBe('—')
    expect(tamanioLegible('x')).toBe('—')
  })

  it('documentosDeVehiculo filtra por auto (FK como string también) y ordena más nuevo primero', () => {
    expect(documentosDeVehiculo(DOCS, '7').map(d => d.id)).toEqual([2, 1])
    expect(documentosDeVehiculo(DOCS, 99)).toEqual([])
  })

  it('idDocumentoValido: sólo enteros positivos de dígitos', () => {
    expect(idDocumentoValido('12')).toBe(12)
    expect(idDocumentoValido(' 7 ')).toBe(7)
    for (const malo of ['0', '-1', '7abc', '../3', '', null, '1.5']) expect(idDocumentoValido(malo)).toBeNull()
  })

  it('documentosGenerados: sólo origen=generado', () => {
    expect(documentosGenerados(DOCS).map(d => d.id)).toEqual([2])
  })
})

describe('buscador de autos y clientes de /documentos', () => {
  const AUTOS = [
    { id: 1, marca: 'VW', modelo: 'Golf', dominio: 'AB123CD', estado: 'publicado' },
    { id: 2, marca: 'Audi', modelo: 'A3', dominio: 'AF494FL', estado: 'reservado' },
    { id: 3, marca: 'Ford', modelo: 'Ka', dominio: 'AC111DD', estado: 'vendido', fecha_venta: '2026-08-20' },
    { id: 4, marca: 'Fiat', modelo: 'Uno', dominio: 'AD222EE', estado: 'vendido', fecha_venta: '2026-03-01' },
    { id: 5, marca: 'Citroën', modelo: 'C4', dominio: 'AE333FF', estado: 'a_ingresar' },
  ]

  it('no vendidos primero (por nombre), después los vendidos de los últimos 90 días', () => {
    expect(autosParaDocumentos(AUTOS, '2026-09-08').map(v => v.id)).toEqual([2, 5, 1, 3])
  })

  it('filtrarAutos busca por marca/modelo sin acentos y por patente sin guiones', () => {
    expect(filtrarAutos(AUTOS, 'citroen').map(v => v.id)).toEqual([5])
    expect(filtrarAutos(AUTOS, 'af 494-fl').map(v => v.id)).toEqual([2])
    expect(filtrarAutos(AUTOS, '').length).toBe(5)
  })

  it('filtrarClientes busca por nombre o DNI', () => {
    const CL = [{ id: 1, nombre: 'Juan Pérez', dni: '30.123.456' }, { id: 2, nombre: 'Ana', dni: '' }]
    expect(filtrarClientes(CL, 'perez').map(c => c.id)).toEqual([1])
    expect(filtrarClientes(CL, '30123').map(c => c.id)).toEqual([1])
    expect(filtrarClientes(CL, 'ana').map(c => c.id)).toEqual([2])
  })
})
