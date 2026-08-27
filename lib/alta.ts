/**
 * Altas desde el dashboard: vehículo, cliente y oferta.
 *
 * Módulo PURO (sin Next, sin fetch, sin env). Lo usan los diálogos de /stock y
 * /clientes para armar el payload, y los tests para fijar las reglas. La
 * validación de verdad la hace el proxy (/api/db/[table], enums server-side) y
 * la route de finanzas; esto es el espejo client-side, para que el error se vea
 * antes de viajar.
 *
 * Por qué existe: la instancia de Renato carga autos por WhatsApp (el bot), pero
 * la instancia nueva (TM Motors) sólo tiene el dashboard — sin un alta acá no
 * hay forma de meter el primer auto.
 *
 * Regla de forma del payload: los campos vacíos se OMITEN, no se mandan en
 * null. En modo Postgres el INSERT valida columna por columna (lib/db.ts
 * checkColumn), así que mandar de más es la forma de romper un alta entera por
 * un campo que el usuario dejó vacío.
 */

// Espejo de ENUMS.vehicles en app/api/db/[table]/route.ts y de lib/estados.ts.
export const ESTADOS_VEHICULO = [
  'a_ingresar', 'en_preparacion', 'publicado', 'reservado', 'vendido',
] as const
export const TIPOS_OPERACION = ['propio', 'consignacion'] as const
// Espejo de ENUMS.clientes.tipo.
export const TIPOS_CLIENTE = ['comprador', 'vendedor', 'acreedor'] as const
// Espejo de ENUMS.ofertas.estado.
export const ESTADOS_OFERTA = ['pendiente', 'aceptada', 'rechazada', 'contraoferta'] as const

export const ESTADO_VEHICULO_DEFAULT = 'a_ingresar'
export const ESTADO_OFERTA_DEFAULT = 'pendiente'

export type AltaOk = { ok: true; row: Record<string, any> }
export type AltaError = { ok: false; error: string }
export type AltaResult = AltaOk | AltaError

export type AltaVehiculoForm = {
  marca: string
  modelo: string
  version: string
  año: string
  km: string
  dominio: string
  color: string
  tipo_operacion: string
  cliente_id: string
  estado: string
  precio_compra: string
  precio_publicado: string
  precio_venta_objetivo: string
  fecha_ingreso: string
}

export type AltaClienteForm = {
  nombre: string
  tipo: string
  telefono: string
  whatsapp: string
  email: string
  dni: string
  cuil: string
  direccion: string
  notas: string
}

export const VEHICULO_FORM_VACIO: AltaVehiculoForm = {
  marca: '', modelo: '', version: '', año: '', km: '', dominio: '', color: '',
  tipo_operacion: 'propio', cliente_id: '', estado: ESTADO_VEHICULO_DEFAULT,
  precio_compra: '', precio_publicado: '', precio_venta_objetivo: '',
  fecha_ingreso: '',
}

/**
 * Alta de oferta desde la ficha de un interesado. Espejo de las columnas reales
 * de `ofertas` (db/migrations/0001_base.sql del backend): el interesado NO es un
 * campo del form — sale del contexto de la fila desde donde se abre el diálogo.
 * `monto_aceptado`, `respuesta_propietario`, `fecha_respuesta` y `email_enviado`
 * son del lado de la RESPUESTA (los completa el bot o una edición posterior) —
 * salvo monto_aceptado, que se ofrece cuando la oferta ya nace aceptada.
 */
export type AltaOfertaForm = {
  vehicle_id: string
  monto_ofrecido: string
  monto_aceptado: string
  estado: string
  notas: string
}

export const OFERTA_FORM_VACIO: AltaOfertaForm = {
  vehicle_id: '', monto_ofrecido: '', monto_aceptado: '',
  estado: ESTADO_OFERTA_DEFAULT, notas: '',
}

export const CLIENTE_FORM_VACIO: AltaClienteForm = {
  nombre: '', tipo: 'comprador', telefono: '', whatsapp: '', email: '',
  dni: '', cuil: '', direccion: '', notas: '',
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** "ab 123 cd" → "AB 123 CD". Las patentes se guardan en mayúscula, siempre. */
export function normalizarDominio(raw: string): string {
  return raw.trim().toUpperCase()
}

const err = (error: string): AltaError => ({ ok: false, error })

/**
 * Número opcional de un input de texto. `null` = el usuario lo dejó vacío (se
 * omite del payload); un string que no es número, o negativo, es error.
 */
function numeroOpcional(
  raw: string,
  label: string,
  entero: boolean,
): { ok: true; value: number | null } | AltaError {
  const t = (raw ?? '').trim()
  if (t === '') return { ok: true, value: null }
  const n = Number(t)
  if (!Number.isFinite(n)) return err(`${label} tiene que ser un número.`)
  if (n < 0) return err(`${label} no puede ser negativo.`)
  if (entero && !Number.isInteger(n)) return err(`${label} tiene que ser un número entero.`)
  return { ok: true, value: n }
}

function idPositivo(raw: string): number | null {
  const n = Number((raw ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Valida el form del alta y devuelve la fila lista para POSTear a `vehicles`.
 * `nowIso` es el instante de created_at/updated_at (lo inyecta el llamador para
 * que el test sea determinista).
 */
export function validarAltaVehiculo(form: AltaVehiculoForm, nowIso: string): AltaResult {
  const marca = (form.marca ?? '').trim()
  const modelo = (form.modelo ?? '').trim()
  if (!marca) return err('La marca es obligatoria.')
  if (!modelo) return err('El modelo es obligatorio.')

  const tipo = (form.tipo_operacion ?? '').trim()
  if (!(TIPOS_OPERACION as readonly string[]).includes(tipo)) {
    return err(`Tipo de operación inválido: ${JSON.stringify(tipo)}.`)
  }
  const estado = (form.estado ?? '').trim() || ESTADO_VEHICULO_DEFAULT
  if (!(ESTADOS_VEHICULO as readonly string[]).includes(estado)) {
    return err(`Estado inválido: ${JSON.stringify(estado)}.`)
  }

  // Un auto en consignación SIN dueño es un auto que después no se puede
  // liquidar: la plata del consignante no tiene a quién volver.
  const cliente_id = idPositivo(form.cliente_id)
  if (tipo === 'consignacion' && cliente_id === null) {
    return err('Un auto en consignación necesita el cliente dueño.')
  }

  const numeros: [keyof AltaVehiculoForm, string, boolean][] = [
    ['año', 'El año', true],
    ['km', 'Los KM', true],
    ['precio_compra', 'El precio de compra', false],
    ['precio_publicado', 'El precio publicado', false],
    ['precio_venta_objetivo', 'El precio objetivo', false],
  ]
  const valores: Record<string, number> = {}
  for (const [campo, label, entero] of numeros) {
    const r = numeroOpcional(String(form[campo] ?? ''), label, entero)
    if (!r.ok) return r
    if (r.value !== null) valores[campo] = r.value
  }

  const fecha_ingreso = (form.fecha_ingreso ?? '').trim()
  if (fecha_ingreso !== '' && !FECHA_RE.test(fecha_ingreso)) {
    return err(`Fecha de ingreso inválida: ${JSON.stringify(fecha_ingreso)}. Se espera YYYY-MM-DD.`)
  }

  const row: Record<string, any> = {
    marca, modelo, tipo_operacion: tipo, estado,
    created_at: nowIso, updated_at: nowIso,
    ...valores,
  }
  const version = (form.version ?? '').trim()
  if (version) row.version = version
  const dominio = normalizarDominio(form.dominio ?? '')
  if (dominio) row.dominio = dominio
  const color = (form.color ?? '').trim()
  if (color) row.color = color
  // Sólo la consignación tiene dueño: el select ni se muestra para un propio, y
  // un cliente_id que quedó de haber tocado el tipo y vuelto atrás no puede
  // colarse en la fila.
  if (tipo === 'consignacion' && cliente_id !== null) row.cliente_id = cliente_id
  if (fecha_ingreso) row.fecha_ingreso = fecha_ingreso

  return { ok: true, row }
}

/**
 * ¿Se ofrece registrar la compra en caja? Sólo tiene sentido para un auto
 * PROPIO con precio de compra > 0: en consignación la plata no sale de la caja
 * (el auto es del consignante), y sin precio no hay monto que asentar.
 */
export function ofreceRegistrarCompra(form: Pick<AltaVehiculoForm, 'tipo_operacion' | 'precio_compra'>): boolean {
  if (form.tipo_operacion !== 'propio') return false
  const n = Number((form.precio_compra ?? '').trim())
  return Number.isFinite(n) && n > 0
}

/**
 * Body del egreso que acompaña al alta, para POSTear a /api/finanzas/movimiento
 * (NO al proxy genérico: `movimientos_contabilidad` no está en su ALLOWED, y esa
 * route es la que setea afecta_balance=1).
 */
export function movimientoCompra(
  form: AltaVehiculoForm,
  vehicleId: number,
  cuenta: string,
): Record<string, any> {
  const body: Record<string, any> = {
    tipo: 'egreso',
    categoria: 'vehicle_purchase',
    cuenta,
    monto: Number(form.precio_compra),
    vehicle_id: vehicleId,
    descripcion: `Compra ${(form.marca ?? '').trim()} ${(form.modelo ?? '').trim()}`.trim(),
  }
  // La compra se asienta el día que entró el auto, no el día que se cargó la
  // pantalla. validarMovimiento ancla una fecha pasada al mediodía AR.
  const fecha = (form.fecha_ingreso ?? '').trim()
  if (FECHA_RE.test(fecha)) body.fecha = fecha
  return body
}

/**
 * `vehicles.version` existe en el Postgres de la instancia nueva pero es dudosa
 * en la D1 de Renato (por eso el backend deduce la versión partiendo `modelo`,
 * ver referencias_tools.split_modelo_version). Si el INSERT rebota por esa
 * columna, se reintenta con la versión pegada al modelo — que es exactamente
 * como están cargados los autos viejos.
 */
export function esErrorColumnaVersion(mensaje?: string): boolean {
  if (!mensaje) return false
  const m = mensaje.toLowerCase()
  if (!m.includes('version')) return false
  return m.includes('columna') || m.includes('column') || m.includes('desconocid') || m.includes('unknown')
}

/** La misma fila sin `version`, con la versión pegada al modelo. */
export function sinColumnaVersion(row: Record<string, any>): Record<string, any> {
  const { version, ...resto } = row
  const v = typeof version === 'string' ? version.trim() : ''
  if (!v) return resto
  return { ...resto, modelo: `${String(resto.modelo ?? '').trim()} ${v}`.trim() }
}

/** Valida el form del alta y devuelve la fila lista para POSTear a `clientes`. */
export function validarAltaCliente(form: AltaClienteForm, nowIso: string): AltaResult {
  const nombre = (form.nombre ?? '').trim()
  if (!nombre) return err('El nombre es obligatorio.')

  const tipo = (form.tipo ?? '').trim()
  if (!(TIPOS_CLIENTE as readonly string[]).includes(tipo)) {
    return err(`Tipo de cliente inválido: ${JSON.stringify(tipo)}.`)
  }

  const row: Record<string, any> = {
    nombre,
    tipo,
    // Los dos campos, siempre: `es_acreedor` y `tipo='acreedor'` están
    // desincronizados en filas viejas y esAcreedor() (app/config/inversores)
    // mira los dos. Un alta nueva no suma otra fila mixta.
    es_acreedor: tipo === 'acreedor' ? 1 : 0,
    created_at: nowIso,
    updated_at: nowIso,
  }
  const opcionales: (keyof AltaClienteForm)[] = [
    'telefono', 'whatsapp', 'email', 'dni', 'cuil', 'direccion', 'notas',
  ]
  for (const campo of opcionales) {
    const v = (form[campo] ?? '').trim()
    if (v) row[campo] = v
  }
  return { ok: true, row }
}

/**
 * Valida el form de una oferta y devuelve la fila lista para POSTear a
 * `ofertas`. `interesadoId` es el dueño de la ficha desde la que se abrió el
 * diálogo: una oferta sin interesado no la puede leer nadie (la lista de
 * /interesados filtra por interesado_id).
 */
export function validarAltaOferta(
  form: AltaOfertaForm,
  interesadoId: any,
  nowIso: string,
): AltaResult {
  const interesado_id = idPositivo(String(interesadoId ?? ''))
  if (interesado_id === null) return err('La oferta necesita un interesado.')

  const vehicle_id = idPositivo(form.vehicle_id)
  if (vehicle_id === null) return err('Elegí por qué auto es la oferta.')

  const estado = (form.estado ?? '').trim() || ESTADO_OFERTA_DEFAULT
  if (!(ESTADOS_OFERTA as readonly string[]).includes(estado)) {
    return err(`Estado de oferta inválido: ${JSON.stringify(estado)}.`)
  }

  const ofrecido = numeroOpcional(String(form.monto_ofrecido ?? ''), 'El monto ofrecido', false)
  if (!ofrecido.ok) return ofrecido
  if (ofrecido.value === null) return err('El monto ofrecido es obligatorio.')
  if (ofrecido.value <= 0) return err('El monto ofrecido tiene que ser mayor que 0.')

  const aceptado = numeroOpcional(String(form.monto_aceptado ?? ''), 'El monto aceptado', false)
  if (!aceptado.ok) return aceptado

  const row: Record<string, any> = {
    interesado_id,
    vehicle_id,
    monto_ofrecido: ofrecido.value,
    estado,
    created_at: nowIso,
    updated_at: nowIso,
  }
  if (aceptado.value !== null) row.monto_aceptado = aceptado.value
  const notas = (form.notas ?? '').trim()
  if (notas) row.notas = notas
  return { ok: true, row }
}
