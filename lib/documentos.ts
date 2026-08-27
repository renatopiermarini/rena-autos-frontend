/**
 * "Generar documento" desde la ficha del auto (/stock).
 *
 * Módulo PURO (sin Next, sin fetch, sin env): arma el body de
 * `POST /api/documentos` y traduce a criollo lo que el backend contesta cuando
 * no puede generar. El diálogo (app/stock/DocumentoDialog.tsx) lo dispara y la
 * route server-side (app/api/documentos/route.ts) lo reenvía al backend con la
 * API key — que nunca llega al browser.
 *
 * Espejo de rena-autos-api/api/documentos.py (contrato verificado en vivo):
 *
 *   body: {tipo, vehicle_id, cliente_id, campos_extra: {...}, formato}
 *     recibo_sena → cliente_id es el COMPRADOR; requiere monto_sena y precio_total.
 *     mandato     → cliente_id es el MANDANTE (el dueño); el auto necesita un
 *                   valor estimado de venta: si la ficha no tiene precio, va
 *                   `valor_usd` en campos_extra.
 *     boleto      → cliente_id es el COMPRADOR; requiere precio_total y
 *                   plazo_transferencia_dias.
 *
 *   200 → el archivo (pdf o docx) · 401 · 404 · 422 con
 *   {detail:{error, faltantes:[...]}}  (datos del cliente que faltan)
 *   {detail:{error, detalles:[...]}}   (validación legal del contrato)
 *
 * POR QUÉ LA TRADUCCIÓN: los dos formatos vienen del motor de contratos y
 * hablan en nombres de campo de pydantic ("vehiculo.dominio: Input should be a
 * valid string"). Al que mira la pantalla eso no le dice nada; lo que necesita
 * saber es "el auto no tiene la patente cargada". La validación client-side de
 * acá es sólo el espejo: la que manda es la del backend.
 */

export type DocumentoTipo = 'recibo_sena' | 'mandato' | 'boleto'
export type FormatoDoc = 'pdf' | 'docx'

/** Los tres documentos, con la descripción que se muestra en las tarjetas. */
export const TIPOS_DOC: {
  tipo: DocumentoTipo
  titulo: string
  descripcion: string
  /** Cómo se llama el cliente que hay que elegir en este documento. */
  rolCliente: string
  hintCliente: string
}[] = [
  {
    tipo: 'recibo_sena',
    titulo: 'Recibo de seña',
    descripcion: 'Cuando te dejan plata para reservar el auto.',
    rolCliente: 'Comprador',
    hintCliente: 'El que deja la seña.',
  },
  {
    tipo: 'mandato',
    titulo: 'Mandato',
    descripcion: 'El dueño te autoriza a vender su auto (consignación).',
    rolCliente: 'Dueño',
    hintCliente: 'El titular que te deja el auto para venderlo.',
  },
  {
    tipo: 'boleto',
    titulo: 'Boleto de compraventa',
    descripcion: 'La venta en sí.',
    rolCliente: 'Comprador',
    hintCliente: 'El que compra el auto.',
  },
]

export function tipoDoc(tipo: string) {
  return TIPOS_DOC.find(t => t.tipo === tipo) ?? null
}

export type DocumentoForm = {
  tipo: DocumentoTipo | ''
  cliente_id: string
  formato: FormatoDoc
  fecha: string
  moneda: 'USD' | 'ARS'
  /** recibo_sena */
  monto_sena: string
  /** recibo_sena + boleto */
  precio_total: string
  /** boleto */
  plazo_transferencia_dias: string
  /** mandato, sólo si el auto no tiene precio cargado. */
  valor_usd: string
}

export const DOCUMENTO_FORM_VACIO: DocumentoForm = {
  tipo: '', cliente_id: '', formato: 'pdf', fecha: '', moneda: 'USD',
  monto_sena: '', precio_total: '', plazo_transferencia_dias: '', valor_usd: '',
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valor estimado de venta que el backend saca de la ficha
 * (`_vehiculo_de_fila`): precio_venta_final o, si no, precio_venta_objetivo.
 * El publicado NO cuenta — es lo que se pide, no lo que se acordó.
 */
export function valorDeVehiculo(vehiculo: any): number | null {
  for (const campo of ['precio_venta_final', 'precio_venta_objetivo']) {
    const n = Number(vehiculo?.[campo] ?? '')
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** ¿Hay que pedir el valor estimado a mano? Sólo el mandato lo exige. */
export function pideValorEstimado(tipo: string, vehiculo: any): boolean {
  return tipo === 'mandato' && valorDeVehiculo(vehiculo) === null
}

export type DocumentoBody = {
  tipo: DocumentoTipo
  vehicle_id: number
  cliente_id: number
  campos_extra: Record<string, any>
  formato: FormatoDoc
}
export type DocumentoPlan = { ok: true; body: DocumentoBody }
export type DocumentoError = { ok: false; error: string }
export type DocumentoResult = DocumentoPlan | DocumentoError

function num(v: string): number | null {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Form + auto → el body de POST /api/documentos, o el primer error en criollo.
 *
 * Espejo client-side de lo que valida el backend, para que el error se vea
 * ANTES de viajar. Lo que no se valida acá (los datos personales del cliente)
 * es a propósito: eso lo sabe la DB, no el form — vuelve como 422 `faltantes`
 * y lo traduce `traducirErrorBackend`.
 */
export function planDocumento(form: DocumentoForm, vehiculo: any): DocumentoResult {
  const tipo = form.tipo
  if (!tipo || !tipoDoc(tipo)) return { ok: false, error: 'Elegí qué documento querés generar.' }
  const meta = tipoDoc(tipo)!

  const vehicleId = Number(vehiculo?.id)
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return { ok: false, error: 'No se pudo identificar el auto.' }
  }
  const clienteId = Number(String(form.cliente_id ?? '').trim())
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return { ok: false, error: `Elegí el ${meta.rolCliente.toLowerCase()}.` }
  }

  const fecha = String(form.fecha ?? '').trim()
  if (fecha && !FECHA_RE.test(fecha)) {
    return { ok: false, error: 'La fecha tiene que ser una fecha válida.' }
  }

  const campos_extra: Record<string, any> = {}
  if (fecha) campos_extra.fecha = fecha

  if (tipo === 'recibo_sena') {
    const sena = num(form.monto_sena)
    const total = num(form.precio_total)
    if (sena === null || sena <= 0) return { ok: false, error: 'Poné cuánta plata te dejaron de seña.' }
    if (total === null || total <= 0) return { ok: false, error: 'Poné el precio total del auto.' }
    if (sena >= total) return { ok: false, error: 'La seña tiene que ser menor al precio total.' }
    campos_extra.monto_sena = sena
    campos_extra.precio_total = total
    campos_extra.moneda = form.moneda || 'USD'
  }

  if (tipo === 'boleto') {
    const total = num(form.precio_total)
    const plazo = num(form.plazo_transferencia_dias)
    if (total === null || total <= 0) return { ok: false, error: 'Poné el precio total de la venta.' }
    if (plazo === null || !Number.isInteger(plazo) || plazo <= 0) {
      return { ok: false, error: 'Poné en cuántos días se transfiere el auto (un número entero de días).' }
    }
    campos_extra.precio_total = total
    campos_extra.plazo_transferencia_dias = plazo
    campos_extra.moneda = form.moneda || 'USD'
  }

  if (tipo === 'mandato' && pideValorEstimado(tipo, vehiculo)) {
    const valor = num(form.valor_usd)
    if (valor === null || valor <= 0) {
      return { ok: false, error: 'El auto no tiene precio cargado: poné el valor estimado de venta.' }
    }
    // El backend sólo lo aplica si la ficha NO tiene precio; nunca pisa el registro.
    campos_extra.valor_usd = valor
  }

  return {
    ok: true,
    body: {
      tipo,
      vehicle_id: vehicleId,
      cliente_id: clienteId,
      campos_extra,
      formato: form.formato === 'docx' ? 'docx' : 'pdf',
    },
  }
}

// ── Traducción de los errores del backend ────────────────────────────────────

export type ErrorDocumento = {
  /** La línea principal, ya en criollo. */
  titulo: string
  /** El detalle, una línea por problema. Puede venir vacío. */
  items: string[]
  /** ¿Se arregla cargando datos en /clientes? Prende el link del diálogo. */
  linkClientes: boolean
}

// Campos de una persona, tal cual los nombra el motor de contratos.
const CAMPO_PERSONA: Record<string, string> = {
  nombre: 'nombre y apellido',
  dni: 'DNI',
  cuil: 'CUIL',
  domicilio: 'domicilio',
  estado_civil: 'estado civil',
  ocupacion: 'ocupación',
  fecha_nacimiento: 'fecha de nacimiento',
}

// Roles del documento → cómo se llaman en la pantalla. `comprador 1/2` es como
// numera el backend cuando el boleto tiene dos compradores.
const ROL_PERSONA: Record<string, string> = {
  comprador: 'Comprador',
  'comprador 1': 'Comprador',
  'comprador 2': 'Segundo comprador',
  compradores: 'Comprador',
  vendedor: 'Vendedor',
  mandante: 'Dueño (mandante)',
  mandatario: 'Agencia (mandatario)',
}

// El mandatario NO sale de `clientes` sino de la config del backend
// (CONTRATOS_MANDATARIO_*): mandar al usuario a /clientes por esos datos sería
// mandarlo a un lugar donde no los puede cargar.
const ROL_NO_ES_CLIENTE = new Set(['mandatario'])

// Campos del documento que no son de nadie (los pide el form).
const CAMPO_DOCUMENTO: Record<string, string> = {
  monto_sena: 'el monto de la seña',
  precio_total: 'el precio total',
  plazo_transferencia_dias: 'el plazo de transferencia',
}

// Campos del auto. Se arreglan en la ficha del auto, no en Clientes.
const CAMPO_VEHICULO: Record<string, string> = {
  marca: 'la marca',
  modelo: 'el modelo',
  anio: 'el año',
  dominio: 'la patente',
  numero_motor: 'el número de motor',
  numero_chasis: 'el número de chasis',
  km: 'los kilómetros',
  valor_usd: 'el valor estimado de venta',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Lista "a, b y c". */
function enumerar(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

/**
 * 422 `faltantes` → criollo.
 *
 * Los faltantes vienen en cuatro formas (tools/contratos_tools.py):
 *   "comprador.dni" · "comprador 2.ocupacion"   → campo de una persona
 *   "monto_sena"                                → campo del documento
 *   "vendedor (nombre y datos)"                 → falta la parte entera
 *   "vehiculo.valor_usd (valor estimado…)"      → campo del auto
 */
export function traducirFaltantes(faltantes: string[]): ErrorDocumento {
  // Se agrupa por rol para no escupir una línea por campo: el usuario tiene que
  // ir UNA vez a la ficha del cliente y cargar todo lo que falta.
  const porRol = new Map<string, string[]>()
  const items: string[] = []
  let linkClientes = false

  for (const crudo of faltantes) {
    // "vendedor (nombre y datos)" → "vendedor": el paréntesis es prosa.
    const base = String(crudo ?? '').replace(/\s*\(.*\)\s*$/, '').trim()
    if (!base) continue
    const punto = base.indexOf('.')
    const rol = punto === -1 ? base : base.slice(0, punto)
    const campo = punto === -1 ? '' : base.slice(punto + 1)

    if (rol === 'vehiculo') {
      const label = CAMPO_VEHICULO[campo] ?? `el campo ${campo}`
      items.push(
        campo === 'valor_usd'
          ? 'El auto no tiene precio cargado: poné el valor estimado de venta acá abajo, o cargale el precio en la ficha.'
          : `Al auto le falta ${label} — cargalo en la ficha del auto.`,
      )
      continue
    }

    if (rol in ROL_PERSONA) {
      if (!ROL_NO_ES_CLIENTE.has(rol)) linkClientes = true
      const lista = porRol.get(rol) ?? []
      // Sin campo = no hay ninguna persona en ese rol.
      lista.push(campo ? (CAMPO_PERSONA[campo] ?? campo.replace(/_/g, ' ')) : '')
      porRol.set(rol, lista)
      continue
    }

    if (campo === '' && base in CAMPO_DOCUMENTO) {
      items.push(`Falta ${CAMPO_DOCUMENTO[base]}.`)
      continue
    }
    items.push(`Falta: ${base.replace(/_/g, ' ')}.`)
  }

  const lineasPersona = Array.from(porRol.entries()).map(([rol, campos]) => {
    const label = ROL_PERSONA[rol]
    const reales = campos.filter(Boolean)
    if (reales.length === 0) {
      return `${label}: no hay ninguno cargado para este documento.`
    }
    const cola = ROL_NO_ES_CLIENTE.has(rol)
      ? ' (se configura en el backend, no en Clientes)'
      : ''
    return `${label}: falta ${enumerar(reales)}${cola}.`
  })

  const todo = [...lineasPersona, ...items]
  return {
    titulo: linkClientes
      ? 'Le faltan datos al cliente para poder generar el documento.'
      : 'Faltan datos para generar el documento.',
    items: todo,
    linkClientes,
  }
}

// Mensajes del validador (pydantic + los ValueError del motor) → cláusula en
// criollo. `{campo}` se reemplaza por el nombre del campo con su artículo ("la
// patente", "el DNI"), que es lo que evita el "el patente no está cargado".
// La clave se busca por PREFIJO: pydantic agrega el detalle atrás ("String
// should have at least 2 characters").
const MENSAJE_VALIDACION: [prefijo: string, criollo: string][] = [
  ['Input should be a valid string', 'falta {campo}'],
  ['Input should be a valid integer', 'falta {campo} (o no es un número)'],
  ['Input should be a valid number', 'falta {campo} (o no es un número)'],
  ['Input should be a valid date', '{campo} no es una fecha válida'],
  ['Field required', 'falta {campo}'],
  ['String should have at least', '{campo} está vacío o es demasiado corto'],
  ['Dominio inválido', 'la patente está mal escrita (se espera AAA999 o AA999AA)'],
  ['DNI inválido', 'el DNI tiene que tener 7 u 8 dígitos'],
  ['CUIL/CUIT inválido', 'el CUIL/CUIT no pasa el dígito verificador (verificá los 11 dígitos)'],
  ['fecha de nacimiento inválida', 'la fecha de nacimiento no es una fecha real (DD/MM/AAAA)'],
  ['fecha de nacimiento fuera de rango', 'la fecha de nacimiento está fuera de rango'],
  ['texto demasiado largo', '{campo} es demasiado largo para un documento legal'],
  ['texto inválido', '{campo} tiene caracteres que no se aceptan (< o >)'],
]

// Mensajes que NO son de un campo sino del documento entero. ("Faltan datos de
// X: a, b" también lo es, pero se arma a mano en faltanDatosDe().)
const MENSAJE_DOCUMENTO: [prefijo: string, criollo: string][] = [
  ['La seña debe ser menor al precio total', 'La seña tiene que ser menor al precio total.'],
  ['La seña previa debe ser menor al precio total', 'La seña previa tiene que ser menor al precio total.'],
  ['El mandato requiere el valor estimado de venta',
    'El mandato necesita el valor estimado de venta del auto: cargalo acá abajo o poné el precio en la ficha.'],
]

/** "comprador.cuil" / "compradores.0.dni" / "vehiculo.dominio" → etiqueta. */
function etiquetaLoc(loc: string): { sujeto: string; campo: string; esCliente: boolean } | null {
  const partes = loc.split('.')
  if (partes[0] === 'vehiculo') {
    return { sujeto: 'El auto', campo: CAMPO_VEHICULO[partes[1]] ?? partes[1] ?? '', esCliente: false }
  }
  if (partes[0] === 'compradores') {
    const i = Number(partes[1])
    const sujeto = Number.isFinite(i) && i > 0 ? 'El segundo comprador' : 'El comprador'
    return { sujeto, campo: CAMPO_PERSONA[partes[2]] ?? (partes[2] ?? '').replace(/_/g, ' '), esCliente: true }
  }
  const rol = ROL_PERSONA[partes[0]]
  if (rol) {
    return {
      sujeto: partes[0] === 'mandatario' ? 'La agencia (mandatario)' : `El ${rol.toLowerCase()}`,
      campo: CAMPO_PERSONA[partes[1]] ?? (partes[1] ?? '').replace(/_/g, ' '),
      esCliente: !ROL_NO_ES_CLIENTE.has(partes[0]),
    }
  }
  return null
}

/** "Faltan datos de comprador: estado_civil, ocupacion" → criollo, o null. */
function faltanDatosDe(msg: string): { texto: string; esCliente: boolean } | null {
  const m = /^Faltan datos de (.+?): (.+)$/.exec(msg)
  if (!m) return null
  const rol = ROL_PERSONA[m[1].trim()] ?? cap(m[1].trim())
  const campos = m[2].split(',').map(c => CAMPO_PERSONA[c.trim()] ?? c.trim().replace(/_/g, ' '))
  return {
    texto: `${rol}: falta ${enumerar(campos)}.`,
    esCliente: !ROL_NO_ES_CLIENTE.has(m[1].trim()),
  }
}

/**
 * 422 `detalles` → criollo.
 *
 * Cada detalle viene como "loc: msg" (api/documentos.py `_detalles_validacion`),
 * con el "Value error, " que le pega pydantic adelante de los ValueError de los
 * validadores. Un loc vacío se serializa como "documento".
 */
export function traducirDetalles(detalles: string[]): ErrorDocumento {
  const items: string[] = []
  let linkClientes = false

  for (const crudo of detalles) {
    const texto = String(crudo ?? '').trim()
    if (!texto) continue
    const corte = texto.indexOf(': ')
    const loc = corte === -1 ? 'documento' : texto.slice(0, corte)
    let msg = (corte === -1 ? texto : texto.slice(corte + 2)).trim()
    msg = msg.replace(/^Value error,\s*/, '')

    const falta = faltanDatosDe(msg)
    if (falta) {
      items.push(falta.texto)
      if (falta.esCliente) linkClientes = true
      continue
    }

    const doc = MENSAJE_DOCUMENTO.find(([p]) => msg.startsWith(p))
    if (doc) { items.push(doc[1]); continue }

    const et = loc === 'documento' ? null : etiquetaLoc(loc)
    const campo = MENSAJE_VALIDACION.find(([p]) => msg.startsWith(p))
    if (et && campo) {
      if (et.esCliente) linkClientes = true
      // "El auto: falta la patente." / "El comprador: el CUIL/CUIT no pasa…"
      items.push(`${et.sujeto}: ${campo[1].replace('{campo}', et.campo || 'el dato')}.`)
      continue
    }
    if (et) {
      if (et.esCliente) linkClientes = true
      items.push(`${et.sujeto}${et.campo ? ` — ${et.campo}` : ''}: ${msg}`)
      continue
    }
    items.push(cap(msg))
  }

  return {
    titulo: 'El documento no se puede armar con estos datos.',
    items,
    linkClientes,
  }
}

/**
 * Respuesta de error de /api/documentos → qué mostrar en el diálogo.
 * `json` es lo que devolvió la route (passthrough del backend, o su propio
 * error cuando la feature no está configurada / el backend no responde).
 */
export function traducirErrorBackend(status: number, json: any): ErrorDocumento {
  const solo = (titulo: string): ErrorDocumento => ({ titulo, items: [], linkClientes: false })

  if (status === 501 || json?.error === 'documentos_no_configurado') {
    return solo('La generación de documentos no está configurada en esta instancia.')
  }
  if (json?.error === 'backend_inalcanzable') {
    return solo('No se pudo hablar con el backend que genera los documentos. Probá de nuevo en un rato.')
  }
  if (status === 401 || status === 403) {
    return solo('El backend rechazó la clave de acceso. Avisá que hay que revisar BACKEND_API_KEY.')
  }

  const detail = json?.detail
  if (Array.isArray(detail?.faltantes) && detail.faltantes.length > 0) {
    return traducirFaltantes(detail.faltantes)
  }
  if (Array.isArray(detail?.detalles) && detail.detalles.length > 0) {
    return traducirDetalles(detail.detalles)
  }
  if (typeof detail === 'string' && detail.trim()) return solo(detail.trim())
  if (typeof detail?.error === 'string' && detail.error.trim()) return solo(detail.error.trim())
  const msg = json?.message || json?.error
  if (typeof msg === 'string' && msg.trim()) return solo(msg.trim())
  return solo(`No se pudo generar el documento (error ${status}).`)
}

// ── Descarga ─────────────────────────────────────────────────────────────────

/**
 * Nombre del archivo desde el Content-Disposition.
 *
 * El backend manda LOS DOS: un `filename` ASCII de respaldo y el `filename*`
 * en UTF-8 con el nombre de verdad ("Recibo de Seña - Pérez - AB123CD.pdf") —
 * un header HTTP es latin-1 y los apellidos llevan tildes. Gana el `filename*`.
 */
export function filenameDeDisposition(header: string | null | undefined, fallback: string): string {
  const h = String(header ?? '')
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(h)
  if (utf8) {
    try {
      const nombre = decodeURIComponent(utf8[1].trim())
      if (nombre) return nombre
    } catch { /* header roto: cae al ASCII */ }
  }
  const ascii = /filename\s*=\s*"([^"]+)"/i.exec(h) ?? /filename\s*=\s*([^;]+)/i.exec(h)
  const nombre = ascii?.[1]?.trim()
  return nombre || fallback
}

/** Nombre de respaldo si el header no vino: "recibo_sena-AB123CD.pdf". */
export function filenameFallback(tipo: string, vehiculo: any, formato: FormatoDoc): string {
  const id = String(vehiculo?.dominio || vehiculo?.id || 'auto').replace(/[^\w.-]/g, '')
  return `${tipo}-${id}.${formato}`
}
