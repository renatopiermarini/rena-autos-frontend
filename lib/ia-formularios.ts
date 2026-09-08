/**
 * Lo que cada endpoint de IA devuelve → lo que cada formulario espera.
 *
 * El backend (rena-autos-api api/ia.py) habla en su idioma: "año" con eñe,
 * `domicilio` en vez de `direccion`, `tipo_tarea` en vez de `tipo`, la hora de
 * una tarea como campo aparte. Acá se traduce a las claves y los tipos (todo
 * string) de los forms del dashboard, y `lib/ia.aplicarSugerencia` hace el
 * resto. Cada `sugerencia*` devuelve SÓLO lo que trae valor: lo que no vino se
 * omite y aplicarSugerencia no lo toca.
 *
 * Módulo PURO: sin React, sin fetch, sin DOM.
 */
import { aplicarSugerencia, type CamposIa } from '@/lib/ia'
import { matchVehiculo, type VehiculoLike } from '@/lib/ia-match'
import type { AltaClienteForm, AltaVehiculoForm } from '@/lib/alta'

// ── Tipos de las respuestas (espejo de api/ia.py, todo nullable) ─────────────

export type VehiculoExtraido = {
  tipo_documento?: string | null
  marca?: string | null
  modelo?: string | null
  'año'?: number | null
  anio_modelo?: number | null
  dominio?: string | null
  numero_motor?: string | null
  numero_chasis?: string | null
  tipo_vehiculo?: string | null
  color?: string | null
  uso?: string | null
  cilindrada?: string | null
  titular_nombre?: string | null
  titular_dni?: string | null
  titular_cuil?: string | null
  titular_direccion?: string | null
  fecha_emision?: string | null
  observaciones?: string | null
  confianza?: number | null
}

export type ClienteExtraido = {
  apellido?: string | null
  nombres?: string | null
  nombre?: string | null
  dni?: string | null
  cuil?: string | null
  fecha_nacimiento?: string | null
  sexo?: 'M' | 'F' | 'X' | null
  nacionalidad?: string | null
  domicilio?: string | null
  confianza?: number | null
}

export type InteresadoExtraido = {
  nombre?: string | null
  telefono?: string | null
  email?: string | null
  instagram?: string | null
  fuente?: 'instagram' | 'mercadolibre' | 'whatsapp' | 'referido' | 'otro' | null
  marca_buscada?: string | null
  modelo_buscado?: string | null
  'año_min'?: number | null
  'año_max'?: number | null
  km_max?: number | null
  presupuesto?: number | null
  forma_pago?: 'contado' | 'financiado' | 'señado' | null
  notas?: string | null
  resumen?: string | null
  proximo_paso?: string | null
  fecha_sugerida?: string | null
}

export type AgendaParseada = {
  tipo: 'visita' | 'tarea'
  vehicle_id?: number | null
  interesado_id?: number | null
  interesado_nombre_nuevo?: string | null
  fecha?: string | null
  hora?: string | null
  notas?: string | null
  titulo?: string | null
  descripcion?: string | null
  tipo_tarea?: 'lavado' | 'fotos' | 'publicacion' | 'tramite' | 'seguimiento' | 'otro' | null
  prioridad?: 'alta' | 'media' | 'baja' | null
  estado?: string | null
  asignado?: string | null
  fecha_vencimiento?: string | null
  advertencias?: string[] | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function texto(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Un número de la IA como string del form; `0`/null/NaN se omiten. */
function numero(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

/** Deja en el objeto sólo las claves con valor: lo vacío no viaja al form. */
function sinVacios<T extends Record<string, string>>(o: T): Partial<T> {
  const salida: Partial<T> = {}
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] !== '') salida[k] = o[k]
  }
  return salida
}

/**
 * Como `aplicarSugerencia`, pero un campo que todavía tiene su valor POR
 * DEFECTO (el select de "fuente" en 'otro', "tipo de operación" en 'propio')
 * cuenta como vacío: nadie lo escribió, la IA lo puede llenar. Lo que el
 * usuario cambió a mano sigue sin pisarse.
 */
export function aplicarSugerenciaConDefaults<T extends Record<string, unknown>>(
  form: T,
  sugerido: Partial<Record<keyof T, unknown>>,
  defaults: Partial<T>,
): { form: T; camposIa: CamposIa<T> } {
  const base = { ...form }
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    if (form[k] === defaults[k]) base[k] = '' as T[keyof T]
  }
  const r = aplicarSugerencia(base, sugerido)
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    if (r.form[k] === '') r.form[k] = form[k]
  }
  return r
}

// ── 1. Tarjeta verde → Nuevo auto / ficha ────────────────────────────────────

/** Los campos del alta que la cédula trae. La versión NO: el schema no la separa del modelo. */
export function sugerenciaVehiculo(d: VehiculoExtraido): Partial<AltaVehiculoForm> {
  return sinVacios({
    marca: texto(d.marca),
    modelo: texto(d.modelo),
    'año': numero(d['año'] ?? d.anio_modelo),
    dominio: texto(d.dominio),
    color: texto(d.color),
    numero_motor: texto(d.numero_motor),
    numero_chasis: texto(d.numero_chasis),
  })
}

export type TitularExtraido = { nombre: string; dni: string; cuil: string; direccion: string }

/**
 * El titular de la cédula, listo para pre-llenar un cliente. `null` si la
 * cédula no trae nombre, o si el titular ES la agencia (`agencia` = el nombre
 * de branding): un auto propio no necesita "cliente dueño".
 */
export function titularDe(d: VehiculoExtraido, agencia?: string | null): TitularExtraido | null {
  const nombre = texto(d.titular_nombre)
  if (!nombre) return null
  const a = texto(agencia).toLowerCase()
  if (a && (nombre.toLowerCase().includes(a) || a.includes(nombre.toLowerCase()))) return null
  return {
    nombre,
    dni: texto(d.titular_dni).replace(/\D+/g, ''),
    cuil: texto(d.titular_cuil).replace(/\D+/g, ''),
    direccion: texto(d.titular_direccion),
  }
}

// ── 2. DNI → Cliente ─────────────────────────────────────────────────────────

export function sugerenciaCliente(d: ClienteExtraido): Partial<AltaClienteForm> {
  return sinVacios({
    nombre: texto(d.nombre) || [texto(d.apellido).toUpperCase(), texto(d.nombres)].filter(Boolean).join(' '),
    dni: texto(d.dni),
    cuil: texto(d.cuil),
    fecha_nacimiento: texto(d.fecha_nacimiento),
    direccion: texto(d.domicilio),
  })
}

// ── 3. Chat pegado → Interesado ──────────────────────────────────────────────

export type InteresadoForm = {
  nombre: string; telefono: string; email: string; instagram: string
  fuente: string; vehicle_id: string; marca_buscada: string; modelo_buscado: string
  'año_min': string; 'año_max': string; km_max: string
  presupuesto: string; forma_pago: string; notas: string
}

export type SeguimientoPropuesto = { resumen: string; proximo_paso: string; fecha_sugerida: string }

/**
 * Campos del form + el seguimiento propuesto (que por ahora sólo se muestra y,
 * si el usuario quiere, va al final de las notas — ver textoSeguimiento).
 * `vehicle_id` sale de cruzar marca/modelo buscados contra el stock.
 */
export function sugerenciaInteresado(
  d: InteresadoExtraido,
  vehicles: VehiculoLike[],
): { campos: Partial<InteresadoForm>; seguimiento: SeguimientoPropuesto | null } {
  const marca = texto(d.marca_buscada)
  const modelo = texto(d.modelo_buscado)
  // Con marca y modelo primero; si la marca vino como alias ("VW", "Chevy")
  // y no pega, el modelo solo suele alcanzar.
  const vehicleId = matchVehiculo(vehicles, { marca, modelo })
    ?? (marca && modelo ? matchVehiculo(vehicles, { modelo }) : null)
  const campos = sinVacios({
    nombre: texto(d.nombre),
    telefono: texto(d.telefono),
    email: texto(d.email),
    instagram: texto(d.instagram),
    fuente: texto(d.fuente),
    vehicle_id: vehicleId === null ? '' : String(vehicleId),
    marca_buscada: marca,
    modelo_buscado: modelo,
    'año_min': numero(d['año_min']),
    'año_max': numero(d['año_max']),
    km_max: numero(d.km_max),
    presupuesto: numero(d.presupuesto),
    forma_pago: texto(d.forma_pago),
    notas: texto(d.notas),
  })
  const resumen = texto(d.resumen)
  const proximo = texto(d.proximo_paso)
  const seguimiento = resumen || proximo
    ? { resumen, proximo_paso: proximo, fecha_sugerida: texto(d.fecha_sugerida) }
    : null
  return { campos, seguimiento }
}

/** "Seguimiento: <resumen> — Próximo paso: <paso> (<fecha>)". Vacío si no hay nada. */
export function textoSeguimiento(s: SeguimientoPropuesto | null | undefined): string {
  if (!s) return ''
  const partes: string[] = []
  if (s.resumen) partes.push(`Seguimiento: ${s.resumen}`)
  if (s.proximo_paso) {
    partes.push(`Próximo paso: ${s.proximo_paso}${s.fecha_sugerida ? ` (${s.fecha_sugerida})` : ''}`)
  } else if (s.fecha_sugerida) {
    partes.push(`Próximo contacto: ${s.fecha_sugerida}`)
  }
  return partes.join(' — ')
}

/** Las notas del form con el seguimiento al final (sin duplicarlo si ya está). */
export function notasConSeguimiento(notas: string, s: SeguimientoPropuesto | null | undefined): string {
  const linea = textoSeguimiento(s)
  const base = (notas ?? '').trim()
  if (!linea) return base
  if (base.includes(linea)) return base
  return base ? `${base}\n${linea}` : linea
}

// ── 4. "Agregar rápido" → Visita / Tarea ─────────────────────────────────────

export type VisitaForm = { vehicle_id: string; interesado_id: string; fecha: string; notas: string }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^(\d{1,2}):(\d{1,2})$/

/** "9:5" → "09:05"; inválida → "". */
export function normalizarHora(h: unknown): string {
  const m = texto(h).match(HORA_RE)
  if (!m) return ''
  const hh = Number(m[1]); const mm = Number(m[2])
  if (hh > 23 || mm > 59) return ''
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/**
 * Lo que va al form de "Nueva visita" (el `fecha` es el value de un
 * `<input type="datetime-local">`, que después pasa por fromARInputValue) más
 * las advertencias a mostrar: las del backend y, si nombró a alguien que no
 * está cargado, una propia.
 */
export function sugerenciaVisita(d: AgendaParseada): { campos: Partial<VisitaForm>; advertencias: string[] } {
  const fecha = texto(d.fecha)
  const hora = normalizarHora(d.hora)
  const advertencias = [...(d.advertencias ?? [])].map(texto).filter(Boolean)
  const nuevo = texto(d.interesado_nombre_nuevo)
  if (nuevo && !d.interesado_id) {
    advertencias.push(`"${nuevo}" no está cargado como interesado: creá primero la ficha en Interesados y después elegilo acá.`)
  }
  if (fecha && !hora) advertencias.push('No dijo a qué hora: quedó a las 10:00, cambiala si hace falta.')
  const campos = sinVacios({
    vehicle_id: numero(d.vehicle_id),
    interesado_id: numero(d.interesado_id),
    fecha: FECHA_RE.test(fecha) ? `${fecha}T${hora || '10:00'}` : '',
    notas: texto(d.notas),
  })
  return { campos, advertencias }
}

export type TareaForm = {
  titulo: string; descripcion: string; tipo: string; prioridad: string
  asignado: string; vehicle_id: string; fecha_vencimiento: string
}

/**
 * "Hora: HH:MM. <descripción>" — el formato que el recordatorio del bot lee
 * (jobs.reactors._extract_hora) y que TareasClient ya muestra. Sin hora, la
 * descripción tal cual; si ya empezaba con "Hora:", no se duplica.
 */
export function descripcionConHora(hora: unknown, descripcion: unknown): string {
  const desc = texto(descripcion)
  const h = normalizarHora(hora)
  if (!h) return desc
  if (/^Hora:\s*\d{1,2}:\d{2}/i.test(desc)) return desc
  return `Hora: ${h}. ${desc}`.trim()
}

/**
 * Lo que va a "Nueva tarea". `asignado` sólo si es una clave real del equipo
 * (si la IA inventa "juan", el select se queda con el default del form).
 */
export function sugerenciaTarea(
  d: AgendaParseada,
  equipoClaves: string[],
): { campos: Partial<TareaForm>; advertencias: string[] } {
  const advertencias = [...(d.advertencias ?? [])].map(texto).filter(Boolean)
  const asignado = texto(d.asignado).toLowerCase()
  const asignadoOk = asignado && equipoClaves.includes(asignado) ? asignado : ''
  if (asignado && !asignadoOk) advertencias.push(`"${asignado}" no es alguien del equipo: quedó el asignado por defecto.`)
  const fecha = texto(d.fecha_vencimiento) || texto(d.fecha)
  const campos = sinVacios({
    titulo: texto(d.titulo),
    descripcion: descripcionConHora(d.hora, d.descripcion),
    tipo: texto(d.tipo_tarea),
    prioridad: texto(d.prioridad),
    asignado: asignadoOk,
    vehicle_id: numero(d.vehicle_id),
    fecha_vencimiento: FECHA_RE.test(fecha) ? fecha : '',
  })
  return { campos, advertencias }
}
