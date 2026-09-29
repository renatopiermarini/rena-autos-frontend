/**
 * Tablero de cashflow (/cashflow) — todas las cuentas, puras y sin red.
 *
 * Tres miradas sobre el MISMO ledger, cada una responde una pregunta distinta:
 *
 *  1. FLUJO DE CAJA (criterio caja): ¿cuánta plata entró y salió de las cajas
 *     cada mes? Sólo filas que afectan saldo, sin las transferencias entre
 *     cuentas propias (salen de una caja y entran a otra: no son plata nueva).
 *     Σ líneas del mes = variación de las cajas, al centavo.
 *
 *  2. RESULTADO (criterio realizado): ¿gano o pierdo plata? El margen de un auto
 *     propio (P&L de pnl_todos: ingresos − egresos_totales) se reconoce el mes en
 *     que se vende; las comisiones de consignación cuando se cobran; el interés
 *     cuando se devenga; los gastos generales y retiros cuando salen.
 *
 *  3. CAPITAL PROPIO (el número de la pestaña Patrimonio) reconstruido día por
 *     día, y el PUENTE que explica cada variación. El capital valúa el stock a
 *     precio esperado, así que se mueve por cosas que el resultado todavía no ve:
 *     entra un auto → sube su margen esperado; se le gasta → baja; se vende más
 *     barato que lo esperado → baja; se devenga interés → baja.
 *
 * El capital de hoy sale de computePatrimonio (lib/kapso.ts) con TODOS los
 * datos: es exactamente el número de /finanzas y del MCP. El de un día pasado
 * sale de la misma función con los datos "como estaban ese día" — movimientos
 * hasta ese día, autos que ya existían y todavía no se habían vendido, préstamos
 * vivos. Limitación honesta: la valuación del stock usa los precios cargados
 * HOY en cada ficha (no hay historial de precios).
 */
import {
  affectsBalance, arDay, coerceId, computeLoanPosition, computePatrimonio,
  computeVehicleFinancials, round2, DEFAULT_CUENTAS,
} from '@/lib/kapso'
import { money } from '@/lib/money'

// ── Fechas ───────────────────────────────────────────────────────────────────

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" → "sep 26". */
export function mesCorto(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`
}

/** "2026-09" → "septiembre". */
export function mesLargo(mes: string): string {
  return MESES_LARGOS[Number(mes.split('-')[1]) - 1] ?? mes
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function lastDayOfMonth(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** Meses "YYYY-MM" de `desde` a `hasta`, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [y, m] = desde.slice(0, 7).split('-').map(Number)
  const [hy, hm] = hasta.slice(0, 7).split('-').map(Number)
  while (y < hy || (y === hy && m <= hm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m === 13) { m = 1; y += 1 }
  }
  return out
}

// El ledger arranca con una fila `apertura` fechada en 1999 (el saldo inicial
// que absorbió la migración a balance derivado). Todo lo anterior a este piso
// es "saldo de arranque", no un mes del negocio.
const PISO_HISTORIA = '2020-01-01'

// ── Transferencias entre cajas propias ───────────────────────────────────────

const TRANSFER_VENTANA_MS = 30 * 60 * 1000

/**
 * Ids de los movimientos que son una pata de una transferencia entre cuentas
 * propias ("nexo → cash"): se registran como un egreso y un ingreso `other` del
 * mismo monto, en cuentas distintas, con segundos de diferencia. No son plata
 * que entra ni que sale del negocio, así que el flujo de caja los saltea.
 */
export function detectarTransferencias(movs: any[]): Set<number> {
  const cands = movs
    .filter(m => affectsBalance(m) && (m.categoria === 'other' || m.categoria === 'transferencia'))
    .map(m => ({ m, t: Date.parse(String(m.created_at ?? '').replace(' ', 'T')) }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)
  const usados = new Set<any>()
  const out = new Set<number>()
  for (const a of cands) {
    if (usados.has(a.m) || a.m.tipo !== 'egreso') continue
    const par = cands.find(b =>
      !usados.has(b.m) && b.m.tipo === 'ingreso'
      && String(b.m.cuenta) !== String(a.m.cuenta)
      && Math.abs(Number(b.m.monto) - Number(a.m.monto)) < 0.005
      && Math.abs(b.t - a.t) <= TRANSFER_VENTANA_MS)
    if (!par) continue
    usados.add(a.m); usados.add(par.m)
    const ia = coerceId(a.m.id), ib = coerceId(par.m.id)
    if (ia !== null) out.add(ia)
    if (ib !== null) out.add(ib)
  }
  return out
}

// ── Contexto: datos preparados una sola vez ──────────────────────────────────

type Mov = any & { _day: string; _s: number; _key: string }

type VehiculoLinea = { existe: string; vendido: string | null; tipo: string; label: string }
type PrestamoLinea = { inicio: string; cierre: string | null }

type Ctx = {
  movs: Mov[]                 // ordenados por día
  vehicles: any[]
  vehById: Map<number, any>
  prestamos: any[]
  clientes: any[]
  cuentas: string[]
  hoy: string
  vt: Map<number, VehiculoLinea>
  lt: Map<number, PrestamoLinea>
  transfer: Set<string>
}

function vehLabel(v: any): string {
  return `${v?.marca ?? ''} ${v?.modelo ?? ''}`.trim() + (v?.dominio ? ` (${v.dominio})` : '')
}

// Clave estable de un movimiento aunque no tenga id (los tests arman filas sin id).
function movKey(m: any, i: number): string {
  const id = coerceId(m.id)
  return id !== null ? `id:${id}` : `ix:${i}`
}

function prepararCtx(input: CashflowInput): Ctx {
  const hoy = input.hoy ?? arDay(new Date().toISOString())
  const cuentas = input.cuentas?.length ? input.cuentas : DEFAULT_CUENTAS
  const movs: Mov[] = (input.movimientos ?? [])
    .map((m, i) => ({
      ...m,
      _day: arDay(m.created_at) || '1999-01-01',
      _s: Number(m.monto ?? 0) * (m.tipo === 'ingreso' ? 1 : m.tipo === 'egreso' ? -1 : 0),
      _key: movKey(m, i),
    }))
    .sort((a, b) => a._day.localeCompare(b._day))
  const transferIds = detectarTransferencias(input.movimientos ?? [])
  const transfer = new Set<string>()
  for (const m of movs) {
    const id = coerceId(m.id)
    if (id !== null && transferIds.has(id)) transfer.add(m._key)
  }

  const vehicles = input.vehicles ?? []
  const vehById = new Map<number, any>()
  for (const v of vehicles) {
    const id = coerceId(v.id)
    if (id !== null) vehById.set(id, v)
  }

  // Cuándo existió cada auto y cuándo se vendió. `existe` = lo primero entre el
  // alta de la ficha, la fecha de ingreso y su primer movimiento (hay autos que
  // se compraron antes de cargarse). `vendido` = fecha_venta; sin ella, el día
  // del último ingreso de venta/comisión/seña; sin eso, el último movimiento.
  const vt = new Map<number, VehiculoLinea>()
  const movsPorAuto = new Map<number, Mov[]>()
  for (const m of movs) {
    const vid = coerceId(m.vehicle_id)
    if (vid === null) continue
    const arr = movsPorAuto.get(vid) ?? []
    arr.push(m)
    movsPorAuto.set(vid, arr)
  }
  // Primer día en que el audit_log registra el paso a `vendido` (el log arranca
  // a fines de julio; antes no hay dato y se cae a las heurísticas).
  const vendidoSegunAudit = new Map<number, string>()
  for (const a of input.auditVehiculos ?? []) {
    const vid = coerceId(a.registro_id)
    if (vid === null) continue
    let datos: any = a.datos
    if (typeof datos === 'string') { try { datos = JSON.parse(datos) } catch { datos = null } }
    if (datos?.estado !== 'vendido') continue
    const dia = arDay(a.fecha)
    const prev = vendidoSegunAudit.get(vid)
    if (dia && (!prev || dia < prev)) vendidoSegunAudit.set(vid, dia)
  }

  for (const v of vehicles) {
    const vid = coerceId(v.id)
    if (vid === null) continue
    const propios = movsPorAuto.get(vid) ?? []
    const candidatos = [arDay(v.created_at), /^\d{4}-\d{2}-\d{2}/.test(String(v.fecha_ingreso ?? '')) ? arDay(v.fecha_ingreso) : '', propios[0]?._day ?? '']
      .filter(d => d && d >= PISO_HISTORIA)
    // Un auto propio que se pagó por caja entra al stock el día que se pagó,
    // aunque la ficha se haya cargado antes (la Cayenne estuvo en stock desde
    // junio y se pagó el 01/08; el Cruze AF423MF se cargó el 30/07 y se pagó el
    // 03/08). Contarlo desde la ficha lo sumaba entero con la compra todavía en
    // la caja y lo restaba el día del pago: saltos de ±20k que no existieron.
    const pagoCompra = v.tipo_operacion !== 'consignacion'
      ? propios.find(m => m.categoria === 'vehicle_purchase' && m.tipo === 'egreso' && affectsBalance(m))?._day
      : undefined
    const existe = pagoCompra && pagoCompra >= PISO_HISTORIA
      ? pagoCompra
      : candidatos.length ? candidatos.sort()[0] : PISO_HISTORIA
    let vendido: string | null = null
    if (v.estado === 'vendido') {
      const ventas = propios.filter(m => m.tipo === 'ingreso' && ['venta', 'commission', 'down_payment'].includes(m.categoria))
      // fecha_venta (la fecha del negocio) → el día que la ficha pasó a
      // vendido según el audit_log → el último cobro de venta/comisión/seña →
      // lo primero entre la última edición y el último movimiento (un auto
      // devuelto al dueño sigue teniendo movimientos de cuenta corriente
      // después) → el alta.
      const ultimaEdicion = arDay(v.updated_at)
      const ultimoMov = propios[propios.length - 1]?._day ?? ''
      const heuristica = [ultimaEdicion, ultimoMov].filter(Boolean).sort()[0] ?? ''
      vendido = (v.fecha_venta ? arDay(v.fecha_venta) : '')
        || vendidoSegunAudit.get(vid)
        || ventas[ventas.length - 1]?._day
        || heuristica
        || existe
      // Si el cobro de la venta (o la comisión de una consignación) se cargó
      // después de marcar el auto vendido, sale del stock el día del cobro:
      // si no, el capital baja el valor entero y lo recupera días después.
      const cobro = propios.filter(m => m.tipo === 'ingreso'
        && (v.tipo_operacion === 'consignacion' ? m.categoria === 'commission' : m.categoria === 'venta'))
      const ultimoCobro = cobro[cobro.length - 1]?._day
      if (ultimoCobro && ultimoCobro > vendido!) vendido = ultimoCobro
      if (vendido! < existe) vendido = existe
      if (vendido! > hoy) vendido = hoy
    }
    vt.set(vid, { existe, vendido, tipo: v.tipo_operacion ?? 'propio', label: vehLabel(v) })
  }

  // Préstamos: vivos desde lo primero entre fecha_inicio y el alta (el unificado
  // de Luciano se dio de alta el 16/08 con inicio de intereses el 30/08: la deuda
  // existe desde el 16). Uno cerrado deja de contar el día de su último repago si
  // se canceló con plata, o el día de su última edición si se cerró sin repago
  // (los préstamos que se fundieron en el unificado).
  const lt = new Map<number, PrestamoLinea>()
  for (const p of input.prestamos ?? []) {
    const pid = coerceId(p.id)
    if (pid === null) continue
    const inicios = [arDay(p.fecha_inicio), arDay(p.created_at)].filter(d => d && d >= PISO_HISTORIA).sort()
    const inicio = inicios[0] ?? PISO_HISTORIA
    let cierre: string | null = null
    if (p.estado !== 'activo') {
      const suyos = movs.filter(m => coerceId(m.prestamo_id) === pid)
      const repagos = suyos.filter(m => m.categoria === 'loan_repayment')
      const pos = computeLoanPosition(p, movs, hoy)
      cierre = pos.capital_vivo <= 0.005 && repagos.length
        ? repagos[repagos.length - 1]._day
        : (arDay(p.updated_at) || inicio)
      if (cierre! < inicio) cierre = inicio
    }
    lt.set(pid, { inicio, cierre })
  }

  return {
    movs, vehicles, vehById, prestamos: input.prestamos ?? [], clientes: input.clientes ?? [],
    cuentas, hoy, vt, lt, transfer,
  }
}

function movsHasta(ctx: Ctx, day: string): Mov[] {
  // Los movimientos están ordenados por día: búsqueda binaria del corte.
  let lo = 0, hi = ctx.movs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ctx.movs[mid]._day <= day) lo = mid + 1
    else hi = mid
  }
  return ctx.movs.slice(0, lo)
}

function movsEntre(ctx: Ctx, desdeExcl: string, hastaIncl: string): Mov[] {
  return ctx.movs.filter(m => m._day > desdeExcl && m._day <= hastaIncl)
}

// ── Foto del patrimonio a una fecha ──────────────────────────────────────────

export type Foto = {
  dia: string
  capital: number
  cajas: number
  stock: number
  costoStock: number
  porCobrar: number
  deuda: number
  socios: number
  interesMensual: number
  valorAuto: Map<number, number>
  comisionPendiente: Map<number, number>
  parteSocio: Map<number, number>
  porCobrarClientes: number
  capitalPrestado: number
}

type EstadoAuto = 'nuevo' | 'stock' | 'vendido'

function estadoAuto(ctx: Ctx, vid: number, dia: string): EstadoAuto {
  const t = ctx.vt.get(vid)
  if (!t || t.existe > dia) return 'nuevo'
  if (t.vendido && t.vendido <= dia) return 'vendido'
  return 'stock'
}

function prestamoVivo(ctx: Ctx, p: any, dia: string): boolean {
  const t = ctx.lt.get(coerceId(p.id) ?? -1)
  if (!t || t.inicio > dia) return false
  return t.cierre === null || dia < t.cierre
}

function foto(ctx: Ctx, dia: string): Foto {
  const movs = movsHasta(ctx, dia)
  const vehicles = ctx.vehicles
    .filter(v => estadoAuto(ctx, coerceId(v.id) ?? -1, dia) !== 'nuevo')
    .map(v => (v.estado === 'vendido' && estadoAuto(ctx, coerceId(v.id) ?? -1, dia) === 'stock'
      ? { ...v, estado: 'publicado' } : v))
  const prestamos = ctx.prestamos
    .filter(p => (ctx.lt.get(coerceId(p.id) ?? -1)?.inicio ?? '9999') <= dia)
    .map(p => ({ ...p, estado: prestamoVivo(ctx, p, dia) ? 'activo' : 'pagado' }))
  const pat = computePatrimonio(movs, vehicles, prestamos, ctx.clientes, dia, ctx.cuentas)

  const valorAuto = new Map<number, number>()
  for (const a of pat.stock.autos) if (a.vehicle_id !== null) valorAuto.set(a.vehicle_id, a.valor)
  const comisionPendiente = new Map<number, number>()
  for (const a of pat.por_cobrar.comisiones_consignaciones.autos) if (a.vehicle_id !== null) comisionPendiente.set(a.vehicle_id, a.comision)
  const parteSocio = new Map<number, number>()
  for (const s of pat.parte_socios.autos) if (s.vehicle_id !== null) parteSocio.set(s.vehicle_id, s.parte)

  return {
    dia,
    capital: pat.capital_propio,
    cajas: pat.cajas.total,
    stock: pat.stock.total,
    costoStock: pat.stock.costo_invertido,
    porCobrar: pat.por_cobrar.total,
    deuda: pat.deuda_total,
    socios: pat.parte_socios.total,
    interesMensual: pat.interes_mensual_total,
    valorAuto, comisionPendiente, parteSocio,
    porCobrarClientes: round2(pat.por_cobrar.clientes.reduce((s, c) => s + c.saldo, 0)),
    capitalPrestado: round2(pat.posiciones.reduce((s, p) => s + p.capital_vivo, 0)),
  }
}

// Costo de interés ACUMULADO de un préstamo a una fecha: lo devengado hasta que
// se cerró (o hasta hoy), o lo pagado si se pagó más de lo que el modelo devenga
// (acuerdos de palabra con más interés). Pagos posteriores al cierre también
// cuentan: son interés real que salió de la caja.
function costoInteres(ctx: Ctx, p: any, dia: string): number {
  const t = ctx.lt.get(coerceId(p.id) ?? -1)
  if (!t || t.inicio > dia) return 0
  const corte = t.cierre !== null && t.cierre < dia ? t.cierre : dia
  const devengado = computeLoanPosition(p, movsHasta(ctx, corte), corte).interes_devengado
  const pid = coerceId(p.id)
  const pagado = movsHasta(ctx, dia)
    .filter(m => m.categoria === 'loan_interest' && m.tipo === 'egreso' && coerceId(m.prestamo_id) === pid)
    .reduce((s, m) => s + Number(m.monto ?? 0), 0)
  return Math.max(devengado, pagado)
}

function costoInteresTotal(ctx: Ctx, dia: string): number {
  return ctx.prestamos.reduce((s, p) => s + costoInteres(ctx, p, dia), 0)
}

// ── Clasificación de un movimiento para el puente y el resultado ─────────────

type Balde =
  | { tipo: 'auto'; vid: number }
  | { tipo: 'linea'; linea: 'gastos_generales' | 'gastos_sin_auto' | 'comisiones_sin_auto' | 'retiros' | 'aportes' | 'ajustes' | 'otros' | 'prestamos' | 'clientes' | 'interes' }
  | { tipo: 'transferencia' }

function balde(ctx: Ctx, m: Mov): Balde {
  if (ctx.transfer.has(m._key)) return { tipo: 'transferencia' }
  const cat = m.categoria
  if (cat === 'loan_interest') return { tipo: 'linea', linea: 'interes' }
  if (cat === 'client_expense' || cat === 'client_repayment') return { tipo: 'linea', linea: 'clientes' }
  if (cat === 'loan' || cat === 'loan_disbursement' || cat === 'loan_repayment') return { tipo: 'linea', linea: 'prestamos' }
  if (cat === 'personal_withdrawal') return { tipo: 'linea', linea: 'retiros' }
  if (cat === 'investments') return { tipo: 'linea', linea: 'aportes' }
  if (cat === 'ajuste') return { tipo: 'linea', linea: 'ajustes' }
  const vid = coerceId(m.vehicle_id)
  if (vid !== null && ctx.vehById.has(vid)) return { tipo: 'auto', vid }
  if (cat === 'general_expense' || cat === 'marketing') return { tipo: 'linea', linea: 'gastos_generales' }
  if (cat === 'commission') return { tipo: 'linea', linea: 'comisiones_sin_auto' }
  if (cat === 'vehicle_expense' || cat === 'vehicle_purchase') return { tipo: 'linea', linea: 'gastos_sin_auto' }
  return { tipo: 'linea', linea: 'otros' }
}

// ── Puente del capital propio ────────────────────────────────────────────────

export type LineaPuenteKey =
  | 'autos_entraron' | 'autos_vendidos' | 'autos_gastos' | 'consignaciones'
  | 'gastos_generales' | 'intereses' | 'retiros' | 'socio' | 'otros' | 'diferencias'

export const LINEAS_PUENTE: { key: LineaPuenteKey; label: string; ayuda: string }[] = [
  { key: 'autos_entraron',   label: 'Autos propios que entraron',     ayuda: 'Margen esperado de los autos que se compraron en el período: valor de venta esperado − lo que costaron. El capital lo cuenta apenas entran.' },
  { key: 'autos_vendidos',   label: 'Autos propios vendidos',          ayuda: 'Precio de venta real contra el valor esperado con el que el auto estaba en el stock. Negativo = se vendió por debajo de lo que el capital ya contaba (o sin registrar el ingreso completo).' },
  { key: 'autos_gastos',     label: 'Gastos en autos en stock',        ayuda: 'Preparación, arreglos, papeles y cualquier egreso de un auto propio que sigue sin venderse (y gastos de autos cargados sin auto). El valor esperado no cambia, así que cada peso gastado baja el capital.' },
  { key: 'consignaciones',   label: 'Consignaciones',                  ayuda: 'Comisión esperada de las consignaciones que entraron, más la diferencia entre lo cobrado y lo esperado de las que se vendieron, menos gastos hechos en consignaciones.' },
  { key: 'gastos_generales', label: 'Gastos generales',                ayuda: 'Gastos del negocio que no son de un auto (general_expense + marketing).' },
  { key: 'intereses',        label: 'Intereses de préstamos',          ayuda: 'Interés devengado en el período por todos los préstamos (o pagado, si se pagó más de lo que el modelo devenga).' },
  { key: 'retiros',          label: 'Retiros personales',              ayuda: 'Plata que salió del negocio para uso personal.' },
  { key: 'socio',            label: 'Parte del socio',                 ayuda: 'Porción del margen esperado que le corresponde a un socio (p. ej. Tincho en la Amarok). Sube cuando entra un auto en sociedad y se libera cuando se vende.' },
  { key: 'otros',            label: 'Aportes, ajustes y otros',        ayuda: 'Aportes de capital, ajustes de saldo y movimientos sin categoría (other). Los préstamos y adelantos a clientes bien cargados dan cero acá: entra caja y entra deuda.' },
  { key: 'diferencias',      label: 'Diferencias de registro',         ayuda: 'Lo que el resto de las líneas no explica. Aparece cuando un movimiento que no pasa por caja (afecta_balance = 0) no tiene contrapartida, o se cerró un préstamo con interés impago. Si es grande, hay algo mal cargado.' },
]

export type DetalleAuto = {
  vehicle_id: number
  label: string
  tipo: string
  antes: EstadoAuto
  despues: EstadoAuto
  efecto: number
  linea: LineaPuenteKey
}

export type MovSinCaja = { dia: string; categoria: string; tipo: string; monto: number; auto: string | null; nota: string }

export type Puente = {
  desde: string            // día de la foto inicial (incluido en ella)
  hasta: string
  capitalInicio: number
  capitalFin: number
  lineas: Record<LineaPuenteKey, number>
  autos: DetalleAuto[]
  /** Movimientos del período que no pasan por caja (afecta_balance = 0): de
   *  ahí sale casi siempre la línea "Diferencias de registro". */
  sinCaja: MovSinCaja[]
}

function calcularPuente(ctx: Ctx, f0: Foto, f1: Foto): Puente {
  const lineas = Object.fromEntries(LINEAS_PUENTE.map(l => [l.key, 0])) as Record<LineaPuenteKey, number>
  const flujosAuto = new Map<number, number>()
  const movs = movsEntre(ctx, f0.dia, f1.dia)
  const sinCaja: MovSinCaja[] = movs
    .filter(m => !affectsBalance(m))
    .map(m => {
      const vid = coerceId(m.vehicle_id)
      return {
        dia: m._day, categoria: String(m.categoria ?? ''), tipo: String(m.tipo ?? ''),
        monto: round2(Number(m.monto ?? 0)),
        auto: vid !== null ? (ctx.vt.get(vid)?.label ?? null) : null,
        nota: String(m.nota ?? '').trim(),
      }
    })

  for (const m of movs) {
    const b = balde(ctx, m)
    if (b.tipo === 'transferencia') continue
    if (b.tipo === 'auto') {
      // client_* nunca llega acá (va a 'clientes'), igual que en el P&L.
      flujosAuto.set(b.vid, (flujosAuto.get(b.vid) ?? 0) + m._s)
      continue
    }
    switch (b.linea) {
      case 'gastos_generales': lineas.gastos_generales += m._s; break
      case 'retiros':          lineas.retiros += m._s; break
      case 'comisiones_sin_auto': lineas.consignaciones += m._s; break
      case 'gastos_sin_auto':  lineas.autos_gastos += m._s; break
      case 'interes': {
        // El pago de interés de un préstamo vinculado no mueve el capital (sale
        // caja y baja la deuda): el costo es el devengado, abajo. Uno sin
        // préstamo vinculado no tiene deuda que bajar: es costo directo.
        if (coerceId(m.prestamo_id) === null) lineas.intereses += m._s
        break
      }
      // prestamos / clientes / aportes / ajustes / otros
      default: lineas.otros += m._s
    }
  }

  // Préstamos: capital nuevo sin entrada de caja (o repago sin salida) se
  // compensa acá. Debería dar cero si cada préstamo tiene su movimiento.
  lineas.otros += -(f1.capitalPrestado - f0.capitalPrestado)
  // Adelantos a clientes: pasar plata de la caja al "por cobrar" no mueve el capital.
  lineas.otros += f1.porCobrarClientes - f0.porCobrarClientes
  // Interés devengado.
  lineas.intereses += -(costoInteresTotal(ctx, f1.dia) - costoInteresTotal(ctx, f0.dia))
  // Socio.
  lineas.socio += -(f1.socios - f0.socios)

  // Autos, uno por uno: efecto = cambio de su valor en el stock (o de su
  // comisión pendiente) + todo lo que entró y salió por él en el período.
  const autos: DetalleAuto[] = []
  const ids = new Set<number>()
  for (const mapa of [flujosAuto, f0.valorAuto, f1.valorAuto, f0.comisionPendiente, f1.comisionPendiente]) {
    mapa.forEach((_, vid) => ids.add(vid))
  }
  for (const vid of Array.from(ids)) {
    const t = ctx.vt.get(vid)
    const consig = t?.tipo === 'consignacion'
    const efecto = round2(consig
      ? (f1.comisionPendiente.get(vid) ?? 0) - (f0.comisionPendiente.get(vid) ?? 0) + (flujosAuto.get(vid) ?? 0)
      : (f1.valorAuto.get(vid) ?? 0) - (f0.valorAuto.get(vid) ?? 0) + (flujosAuto.get(vid) ?? 0))
    if (Math.abs(efecto) < 0.005) continue
    const antes = estadoAuto(ctx, vid, f0.dia)
    const despues = estadoAuto(ctx, vid, f1.dia)
    let linea: LineaPuenteKey
    if (consig) linea = 'consignaciones'
    else if (despues === 'vendido') linea = 'autos_vendidos'
    else if (antes === 'nuevo') linea = 'autos_entraron'
    else linea = 'autos_gastos'
    lineas[linea] += efecto
    autos.push({ vehicle_id: vid, label: t?.label ?? `#${vid}`, tipo: t?.tipo ?? 'propio', antes, despues, efecto, linea })
  }
  autos.sort((a, b) => Math.abs(b.efecto) - Math.abs(a.efecto))

  const explicado = LINEAS_PUENTE.reduce((s, l) => s + (l.key === 'diferencias' ? 0 : lineas[l.key]), 0)
  lineas.diferencias = f1.capital - f0.capital - explicado
  for (const l of LINEAS_PUENTE) lineas[l.key] = round2(lineas[l.key])
  return { desde: f0.dia, hasta: f1.dia, capitalInicio: f0.capital, capitalFin: f1.capital, lineas, autos, sinCaja }
}

// ── Flujo de caja mensual ────────────────────────────────────────────────────

export type LineaCajaKey =
  | 'ventas' | 'senas' | 'comisiones' | 'compras' | 'gastos_autos' | 'gastos_generales'
  | 'devoluciones' | 'clientes' | 'prestamos_in' | 'prestamos_out' | 'intereses'
  | 'retiros' | 'aportes' | 'otros'

export const LINEAS_CAJA: { key: LineaCajaKey; label: string; grupo: 'operacion' | 'financiacion' | 'dueno' | 'otros' }[] = [
  { key: 'ventas',           label: 'Ventas de autos propios',        grupo: 'operacion' },
  { key: 'senas',            label: 'Señas cobradas',                 grupo: 'operacion' },
  { key: 'comisiones',       label: 'Comisiones',                     grupo: 'operacion' },
  { key: 'compras',          label: 'Compra de autos',                grupo: 'operacion' },
  { key: 'gastos_autos',     label: 'Gastos de autos',                grupo: 'operacion' },
  { key: 'gastos_generales', label: 'Gastos generales',               grupo: 'operacion' },
  { key: 'devoluciones',     label: 'Devoluciones',                   grupo: 'operacion' },
  { key: 'clientes',         label: 'Adelantos a clientes (neto)',    grupo: 'operacion' },
  { key: 'prestamos_in',     label: 'Préstamos recibidos',            grupo: 'financiacion' },
  { key: 'prestamos_out',    label: 'Devolución de préstamos',        grupo: 'financiacion' },
  { key: 'intereses',        label: 'Intereses pagados',              grupo: 'financiacion' },
  { key: 'retiros',          label: 'Retiros personales',             grupo: 'dueno' },
  { key: 'aportes',          label: 'Aportes',                        grupo: 'dueno' },
  { key: 'otros',            label: 'Otros y ajustes',                grupo: 'otros' },
]

function lineaCaja(m: any): LineaCajaKey {
  switch (m.categoria) {
    case 'venta': return 'ventas'
    // Una seña que PAGAMOS es plata para comprar un auto.
    case 'down_payment': return m.tipo === 'egreso' ? 'compras' : 'senas'
    case 'commission': return 'comisiones'
    case 'vehicle_purchase': return 'compras'
    case 'vehicle_expense': return 'gastos_autos'
    case 'general_expense': case 'marketing': return 'gastos_generales'
    case 'refund': return 'devoluciones'
    case 'client_expense': case 'client_repayment': return 'clientes'
    case 'loan': case 'loan_disbursement': return 'prestamos_in'
    case 'loan_repayment': return 'prestamos_out'
    case 'loan_interest': return 'intereses'
    case 'personal_withdrawal': return 'retiros'
    case 'investments': return 'aportes'
    default: return 'otros'
  }
}

export type CajaMes = {
  lineas: Record<LineaCajaKey, number>
  entradas: number
  salidas: number
  neto: number
  cajaCierre: number
}

// ── Resultado mensual ────────────────────────────────────────────────────────

export type AutoVendido = {
  vehicle_id: number; label: string; dia: string
  ingresos: number; costo: number; margen: number
  gastos: number             // preparación (vehicle_expense) — parte del costo
  dias: number               // de que entró a que se vendió
  valorEsperado: number | null
  socioPct: number
}

export type ConsignacionVendida = {
  vehicle_id: number; label: string; dia: string
  cobrado: number            // comisión + seña − gastos del auto
  dias: number
}

export type ResultadoMes = {
  margenAutos: number
  autosVendidos: AutoVendido[]
  comisiones: number
  consignacionesVendidas: number
  gastosGenerales: number        // negativo
  gastosSinAuto: number          // negativo
  intereses: number              // negativo (devengado)
  operativo: number
  retiros: number                // negativo
  neto: number
  fueraDeResultado: number       // aportes, ajustes y otros: mueven la caja, no el resultado
}

export type GastoMes = {
  gastos_generales: number
  gastos_autos: number
  intereses: number
  retiros: number
}

export type GastoItem = { dia: string; categoria: string; nota: string; monto: number; auto: string | null }

// ── Reporte completo ─────────────────────────────────────────────────────────

export type CashflowInput = {
  movimientos: any[]
  vehicles: any[]
  prestamos: any[]
  clientes: any[]
  cuentas?: string[]
  hoy?: string
  /** Filas PATCH de vehicles del audit_log: fechan el paso a `vendido`. */
  auditVehiculos?: any[]
}

export type Anomalia = { titulo: string; detalle: string; monto: number | null }

export type StockItem = {
  vehicle_id: number; label: string; dias: number
  costo: number; precio: number; sena: number; ganancia: number; socioPct: number
  sinValuar: boolean
}

export type PrestamoItem = {
  id: number; acreedor: string; modalidad: string; tasa: number
  capital: number; interesAdeudado: number; interesMensual: number; deuda: number; inicio: string | null
}

export type CashflowReport = {
  hoy: string
  meses: string[]
  mesActual: string
  capital: {
    hoy: number
    serie: { d: string; v: number }[]
    inicioMes: number
    hace30: number
    maximo: { d: string; v: number }
  }
  fotoHoy: Omit<Foto, 'valorAuto' | 'comisionPendiente' | 'parteSocio'>
  puentes: Record<string, Puente>       // por mes + 'total'
  caja: Record<string, CajaMes>
  resultado: Record<string, ResultadoMes>
  gastos: Record<string, GastoMes>
  topGastos: Record<string, GastoItem[]>
  equilibrio: {
    mesesBase: string[]
    estructuraProm: number
    retirosProm: number
    gastoFijoProm: number
    margenPromAuto: number | null
    autosPorMes: number
    comisionProm: number | null
    consignacionesPorMes: number
    resultadoProm: number
    autosNecesarios: number | null
    mesesDeCaja: number | null
  }
  stock: StockItem[]
  prestamos: PrestamoItem[]
  consignaciones: ConsignacionVendida[]
  anios: string[]
  anomalias: Anomalia[]
}

const GASTO_CATS: Record<string, keyof GastoMes> = {
  general_expense: 'gastos_generales',
  marketing: 'gastos_generales',
  vehicle_expense: 'gastos_autos',
  loan_interest: 'intereses',
  personal_withdrawal: 'retiros',
}

export function buildCashflowReport(input: CashflowInput): CashflowReport {
  const ctx = prepararCtx(input)
  const { hoy } = ctx
  const mesActual = hoy.slice(0, 7)

  // Primer día del negocio: el primer movimiento, auto o préstamo con fecha real.
  const inicios = [
    ...ctx.movs.map(m => m._day),
    ...Array.from(ctx.vt.values()).map(t => t.existe),
    ...Array.from(ctx.lt.values()).map(t => t.inicio),
  ].filter(d => d >= PISO_HISTORIA && d <= hoy).sort()
  const primerDia = inicios[0] ?? hoy
  const meses = mesesEntre(primerDia, hoy)

  // ── Capital día por día
  const serie: { d: string; v: number }[] = []
  const fotoPrevia = foto(ctx, addDays(primerDia, -1))
  serie.push({ d: fotoPrevia.dia, v: fotoPrevia.capital })
  for (let d = primerDia; d <= hoy; d = addDays(d, 1)) {
    serie.push({ d, v: foto(ctx, d).capital })
  }
  const fHoy = foto(ctx, hoy)
  const capitalEn = (dia: string) => {
    let v = serie[0].v
    for (const p of serie) { if (p.d <= dia) v = p.v; else break }
    return v
  }
  const maximo = serie.reduce((a, b) => (b.v > a.v ? b : a), serie[0])

  // ── Puentes por mes + total
  const puentes: Record<string, Puente> = {}
  const cortes = new Map<string, Foto>()
  const fotoEn = (dia: string) => {
    let f = cortes.get(dia)
    if (!f) { f = foto(ctx, dia); cortes.set(dia, f) }
    return f
  }
  for (const mes of meses) {
    const desde = addDays(`${mes}-01`, -1)
    const hasta = mes === mesActual ? hoy : lastDayOfMonth(mes)
    puentes[mes] = calcularPuente(ctx, fotoEn(desde), fotoEn(hasta))
  }
  puentes.total = calcularPuente(ctx, fotoPrevia, fHoy)
  // Un puente por año (clave "2026"): del cierre del año anterior (o el día
  // previo al primer movimiento) al 31/12 o a hoy.
  const anios = Array.from(new Set(meses.map(m => m.slice(0, 4))))
  for (const anio of anios) {
    const desde = anio === primerDia.slice(0, 4) ? fotoPrevia.dia : `${Number(anio) - 1}-12-31`
    const hasta = anio === hoy.slice(0, 4) ? hoy : `${anio}-12-31`
    puentes[anio] = calcularPuente(ctx, fotoEn(desde), fotoEn(hasta))
  }

  // ── Flujo de caja
  const caja: Record<string, CajaMes> = {}
  const cuentasSet = new Set(ctx.cuentas)
  for (const mes of meses) {
    const lineas = Object.fromEntries(LINEAS_CAJA.map(l => [l.key, 0])) as Record<LineaCajaKey, number>
    let entradas = 0, salidas = 0
    for (const m of ctx.movs) {
      if (m._day.slice(0, 7) !== mes || !affectsBalance(m) || ctx.transfer.has(m._key)) continue
      if (!cuentasSet.has(String(m.cuenta ?? ''))) continue
      lineas[lineaCaja(m)] += m._s
      if (m._s > 0) entradas += m._s
      else salidas += -m._s
    }
    for (const l of LINEAS_CAJA) lineas[l.key] = round2(lineas[l.key])
    const hasta = mes === mesActual ? hoy : lastDayOfMonth(mes)
    caja[mes] = {
      lineas,
      entradas: round2(entradas),
      salidas: round2(salidas),
      neto: round2(entradas - salidas),
      cajaCierre: fotoEn(hasta).cajas,
    }
  }

  // ── Resultado mensual (realizado)
  const resultado: Record<string, ResultadoMes> = {}
  const vendidosPorMes = new Map<string, AutoVendido[]>()
  const vendidosSinIngreso: { label: string; costo: number }[] = []
  const vendidosConDiferencia: { label: string; final: number; ingresos: number }[] = []
  const fantasmas: { label: string; precio: number; desde: string; hasta: string }[] = []
  for (const v of ctx.vehicles) {
    const vid = coerceId(v.id)
    if (vid === null || v.tipo_operacion !== 'propio' || v.estado !== 'vendido') continue
    const t = ctx.vt.get(vid)!
    const fin = computeVehicleFinancials(vid, ctx.vehicles, ctx.movs, ctx.prestamos)
    // Mismo criterio que pnl_todos: todos los ingresos del auto menos
    // client_repayment, contra egresos_totales de _ledger_costo.
    const ingresos = round2(ctx.movs
      .filter(m => coerceId(m.vehicle_id) === vid && m.tipo === 'ingreso' && m.categoria !== 'client_repayment')
      .reduce((s, m) => s + Number(m.monto ?? 0), 0))
    if (ingresos <= 0 && fin.egresos_totales <= 0) {
      // Sin plata de ningún lado pero con precio: mientras estuvo "en stock" el
      // capital lo contó entero, como si fuera nuestro y gratis.
      const precio = Number(v.precio_venta_objetivo ?? 0) || Number(v.precio_publicado ?? 0)
      if (precio > 0) fantasmas.push({ label: t.label, precio, desde: t.existe, hasta: t.vendido ?? hoy })
      continue
    }
    if (ingresos <= 0) { vendidosSinIngreso.push({ label: t.label, costo: fin.egresos_totales }); continue }
    const final = Number(v.precio_venta_final ?? 0)
    if (final > 0 && Math.abs(final - ingresos) >= 1) vendidosConDiferencia.push({ label: t.label, final, ingresos })
    const mes = (t.vendido ?? hoy).slice(0, 7)
    const esperado = Number(v.precio_venta_objetivo ?? 0) || Number(v.precio_publicado ?? 0) || null
    const arr = vendidosPorMes.get(mes) ?? []
    arr.push({
      vehicle_id: vid, label: t.label, dia: t.vendido ?? hoy,
      ingresos, costo: fin.egresos_totales, margen: round2(ingresos - fin.egresos_totales),
      gastos: fin.gastos_total,
      dias: Math.max(0, daysBetween(t.existe, t.vendido ?? hoy)),
      valorEsperado: esperado,
      socioPct: Number(v.socio_pct ?? 0),
    })
    vendidosPorMes.set(mes, arr)
  }

  const consigVendidasPorMes = new Map<string, number>()
  const consignaciones: ConsignacionVendida[] = []
  for (const [vid, t] of Array.from(ctx.vt.entries())) {
    if (t.tipo !== 'consignacion' || !t.vendido) continue
    const mes = t.vendido.slice(0, 7)
    const delAuto = ctx.movs.filter(m => coerceId(m.vehicle_id) === vid && !ctx.transfer.has(m._key)
      && m.categoria !== 'client_expense' && m.categoria !== 'client_repayment')
    const cobro = delAuto.some(m => m.tipo === 'ingreso' && (m.categoria === 'commission' || m.categoria === 'down_payment'))
    if (!cobro) continue
    consigVendidasPorMes.set(mes, (consigVendidasPorMes.get(mes) ?? 0) + 1)
    consignaciones.push({
      vehicle_id: vid, label: t.label, dia: t.vendido,
      cobrado: round2(delAuto.reduce((s, m) => s + m._s, 0)),
      dias: Math.max(0, daysBetween(t.existe, t.vendido)),
    })
  }
  consignaciones.sort((a, b) => a.dia.localeCompare(b.dia))

  for (const mes of meses) {
    const desde = addDays(`${mes}-01`, -1)
    const hasta = mes === mesActual ? hoy : lastDayOfMonth(mes)
    let comisiones = 0, gastosGenerales = 0, gastosSinAuto = 0, retiros = 0, fuera = 0, interesDirecto = 0
    for (const m of movsEntre(ctx, desde, hasta)) {
      const b = balde(ctx, m)
      if (b.tipo === 'transferencia') continue
      if (b.tipo === 'auto') {
        // Consignaciones: comisión y seña (que es comisión) menos sus gastos, cuando
        // pasan. Los autos propios se reconocen enteros el mes de la venta.
        if (ctx.vt.get(b.vid)?.tipo === 'consignacion') comisiones += m._s
        continue
      }
      switch (b.linea) {
        case 'comisiones_sin_auto': comisiones += m._s; break
        case 'gastos_generales': gastosGenerales += m._s; break
        case 'gastos_sin_auto': gastosSinAuto += m._s; break
        case 'retiros': retiros += m._s; break
        case 'interes': if (coerceId(m.prestamo_id) === null) interesDirecto += m._s; break
        case 'prestamos': case 'clientes': break      // no son resultado: mueven deuda / por cobrar
        default: fuera += m._s                         // aportes, ajustes, other, apertura
      }
    }
    const intereses = round2(-(costoInteresTotal(ctx, hasta) - costoInteresTotal(ctx, desde)) + interesDirecto)
    const autosVendidos = (vendidosPorMes.get(mes) ?? []).sort((a, b) => a.dia.localeCompare(b.dia))
    const margenAutos = round2(autosVendidos.reduce((s, a) => s + a.margen, 0))
    const operativo = round2(margenAutos + comisiones + gastosGenerales + gastosSinAuto + intereses)
    resultado[mes] = {
      margenAutos,
      autosVendidos,
      comisiones: round2(comisiones),
      consignacionesVendidas: consigVendidasPorMes.get(mes) ?? 0,
      gastosGenerales: round2(gastosGenerales),
      gastosSinAuto: round2(gastosSinAuto),
      intereses,
      operativo,
      retiros: round2(retiros),
      neto: round2(operativo + retiros),
      fueraDeResultado: round2(fuera),
    }
  }

  // ── Gastos (lo que salió de la caja, por tipo) y los más grandes de cada mes
  const gastos: Record<string, GastoMes> = {}
  const topGastos: Record<string, GastoItem[]> = {}
  for (const mes of meses) {
    const g: GastoMes = { gastos_generales: 0, gastos_autos: 0, intereses: 0, retiros: 0 }
    const items: GastoItem[] = []
    for (const m of ctx.movs) {
      if (m._day.slice(0, 7) !== mes || !affectsBalance(m) || m.tipo !== 'egreso') continue
      const k = GASTO_CATS[m.categoria]
      if (!k) continue
      g[k] += Number(m.monto ?? 0)
      if (k === 'gastos_generales' || k === 'gastos_autos') {
        const vid = coerceId(m.vehicle_id)
        items.push({
          dia: m._day, categoria: m.categoria, nota: String(m.nota ?? '').trim(),
          monto: round2(Number(m.monto ?? 0)),
          auto: vid !== null ? (ctx.vt.get(vid)?.label ?? null) : null,
        })
      }
    }
    gastos[mes] = {
      gastos_generales: round2(g.gastos_generales), gastos_autos: round2(g.gastos_autos),
      intereses: round2(g.intereses), retiros: round2(g.retiros),
    }
    topGastos[mes] = items.sort((a, b) => b.monto - a.monto).slice(0, 8)
  }

  // ── Punto de equilibrio: promedio de los últimos 3 meses CERRADOS
  const cerrados = meses.filter(m => m < mesActual)
  const base = cerrados.slice(-3)
  const prom = (f: (m: string) => number) => base.length ? round2(base.reduce((s, m) => s + f(m), 0) / base.length) : 0
  const estructuraProm = prom(m => -(resultado[m].gastosGenerales + resultado[m].gastosSinAuto + resultado[m].intereses))
  const retirosProm = prom(m => -resultado[m].retiros)
  const gastoFijoProm = round2(estructuraProm + retirosProm)
  const ultimos6 = meses.slice(-6)
  const vendidos6 = ultimos6.flatMap(m => resultado[m].autosVendidos)
  const margenPromAuto = vendidos6.length ? round2(vendidos6.reduce((s, a) => s + a.margen, 0) / vendidos6.length) : null
  const consig6 = ultimos6.reduce((s, m) => s + resultado[m].consignacionesVendidas, 0)
  const comis6 = ultimos6.reduce((s, m) => s + resultado[m].comisiones, 0)
  const comisionProm = consig6 ? round2(comis6 / consig6) : null
  const autosNecesarios = margenPromAuto && margenPromAuto > 0 ? round2(gastoFijoProm / margenPromAuto) : null
  const mesesDeCaja = gastoFijoProm > 0 ? round2(fHoy.cajas / gastoFijoProm) : null

  // ── Stock inmovilizado
  const stock: StockItem[] = []
  for (const v of ctx.vehicles) {
    const vid = coerceId(v.id)
    if (vid === null || v.tipo_operacion !== 'propio' || v.estado === 'vendido') continue
    const t = ctx.vt.get(vid)!
    const fin = computeVehicleFinancials(vid, ctx.vehicles, ctx.movs, ctx.prestamos)
    const cargado = Number(v.precio_venta_objetivo ?? 0) || Number(v.precio_publicado ?? 0)
    // Mismo precio que usa computePatrimonio: objetivo → publicado → costo.
    const precio = cargado || fin.costo_total
    const valor = fHoy.valorAuto.get(vid) ?? 0
    stock.push({
      vehicle_id: vid, label: t.label, dias: Math.max(0, daysBetween(t.existe, hoy)),
      costo: fin.costo_total, precio, sena: round2(Math.max(0, precio - valor)),
      ganancia: round2(precio - fin.costo_total),
      socioPct: Number(v.socio_pct ?? 0), sinValuar: !(cargado > 0),
    })
  }
  stock.sort((a, b) => b.costo - a.costo)

  // ── Préstamos vivos
  const nombre = (id: any) => ctx.clientes.find(c => coerceId(c.id) === coerceId(id))?.nombre ?? `#${id}`
  const prestamos: PrestamoItem[] = ctx.prestamos
    .filter(p => p.estado === 'activo')
    .map(p => {
      const pos = computeLoanPosition(p, ctx.movs, hoy)
      return {
        id: coerceId(p.id) ?? 0, acreedor: nombre(p.acreedor_id), modalidad: pos.modalidad, tasa: pos.tasa_pct,
        capital: pos.capital_vivo, interesAdeudado: pos.interes_adeudado, interesMensual: pos.interes_mensual,
        deuda: pos.deuda_total, inicio: pos.fecha_inicio,
      }
    })
    .sort((a, b) => b.deuda - a.deuda)

  // ── A revisar
  const anomalias: Anomalia[] = []
  for (const a of vendidosSinIngreso) {
    anomalias.push({
      titulo: `${a.label}: vendido sin ingreso de venta`,
      detalle: `Figura vendido pero no tiene ningún ingreso cargado. Sus ${money(a.costo)} de costo salieron de la caja y el capital los cuenta como perdidos.`,
      monto: -a.costo,
    })
  }
  for (const a of fantasmas) {
    anomalias.push({
      titulo: `${a.label}: figuró como auto propio sin costo`,
      detalle: `Está cargado como propio, con precio ${money(a.precio)} y sin compra ni venta registradas. Del ${a.desde.split('-').reverse().join('/')} al ${a.hasta.split('-').reverse().join('/')} el capital lo sumó entero y al marcarlo vendido lo restó. Si era de un cliente, pasalo a consignación y la historia del capital queda limpia.`,
      monto: null,
    })
  }
  for (const mes of Array.from(vendidosPorMes.keys())) {
    for (const a of vendidosPorMes.get(mes)!) {
      if (a.socioPct <= 0 || a.margen <= 0) continue
      const parte = round2(a.margen * a.socioPct / 100)
      anomalias.push({
        titulo: `${a.label}: vendido en sociedad (${a.socioPct}% del socio)`,
        detalle: `El margen fue ${money(a.margen)} y ${money(parte)} son del socio. La ganancia y el capital lo cuentan entero como nuestro: si esa parte ya se le pagó, cargala como egreso; si todavía se le debe, el capital está sobreestimado en eso.`,
        monto: -parte,
      })
    }
  }
  for (const a of vendidosConDiferencia) {
    anomalias.push({
      titulo: `${a.label}: precio de venta ≠ lo cobrado`,
      detalle: `La ficha dice que se vendió en ${money(a.final)} pero los ingresos cargados suman ${money(a.ingresos)}. Si falta registrar un cobro, el capital está subestimado en la diferencia.`,
      monto: round2(a.ingresos - a.final),
    })
  }
  for (const v of ctx.vehicles) {
    const vid = coerceId(v.id)
    if (vid === null || v.tipo_operacion !== 'propio' || v.estado === 'vendido') continue
    // computePatrimonio saltea un auto propio sin costo de compra ni precio: la
    // plata que ya se le puso (una seña pagada, un gasto) sale de la caja y no
    // aparece en el stock.
    if (fHoy.valorAuto.has(vid)) continue
    const fin = computeVehicleFinancials(vid, ctx.vehicles, ctx.movs, ctx.prestamos)
    if (fin.egresos_totales < 1) continue
    anomalias.push({
      titulo: `${ctx.vt.get(vid)?.label}: plata puesta que el patrimonio no ve`,
      detalle: `Lleva ${money(fin.egresos_totales)} de egresos pero no tiene precio de compra ni precio esperado, así que no suma al stock y el capital los cuenta como gastados. Cargale el precio de compra y el de venta esperado.`,
      monto: -fin.egresos_totales,
    })
  }
  // Deuda de un cliente dada por cobrada sin que la plata entre a una caja: el
  // "por cobrar" baja y nada sube. Una compensación (el cliente paga con un
  // auto, como el 330i) trae su contrapartida el mismo día y no se marca.
  for (const m of ctx.movs) {
    if (m.categoria !== 'client_repayment' || affectsBalance(m) || m._day < PISO_HISTORIA) continue
    const cid = coerceId(m.cliente_id)
    const contrapartida = ctx.movs.some(o => o !== m && !affectsBalance(o) && o._day === m._day
      && o.tipo === 'egreso' && coerceId(o.cliente_id) !== cid)
    if (contrapartida) continue
    const cliente = ctx.clientes.find(c => coerceId(c.id) === cid)?.nombre ?? (cid !== null ? `cliente #${cid}` : 'un cliente')
    anomalias.push({
      titulo: `Cobro a ${cliente} que no entró a ninguna caja`,
      detalle: `El ${m._day.split('-').reverse().join('/')} se dio por cobrada su deuda (${money(Number(m.monto))}) con un movimiento que no afecta saldo: el por cobrar bajó y ninguna caja subió, así que el capital bajó eso. Si la plata entró, falta registrarla en la caja donde está; si se perdonó, es una pérdida.`,
      monto: -round2(Number(m.monto)),
    })
  }
  // Movimientos sin caja (afecta_balance = 0) que no cierran en el día: una
  // venta cobrada "por fuera", un préstamo que no entró a ninguna caja, una
  // compra pagada con plata que no salió de ninguna. Cada día debería sumar
  // cero (lo que entra por un lado sale por otro, como en la venta del 330i).
  const sinCajaPorDia = new Map<string, Mov[]>()
  for (const m of ctx.movs) {
    if (affectsBalance(m) || m._day < PISO_HISTORIA || m.categoria === 'client_repayment') continue
    const arr = sinCajaPorDia.get(m._day) ?? []
    arr.push(m)
    sinCajaPorDia.set(m._day, arr)
  }
  const descuadres = Array.from(sinCajaPorDia.entries())
    .map(([dia, ms]) => ({ dia, ms, neto: round2(ms.reduce((s, m) => s + m._s, 0)) }))
    .filter(d => Math.abs(d.neto) >= 1)
    .sort((a, b) => b.dia.localeCompare(a.dia))
  for (const d of descuadres.slice(0, 5)) {
    const que = d.ms.map(m => {
      const vid = coerceId(m.vehicle_id)
      const auto = vid !== null ? ctx.vt.get(vid)?.label : null
      return `${m.tipo === 'ingreso' ? '+' : '−'}${money(Number(m.monto))} ${m.categoria}${auto ? ` (${auto})` : ''}`
    }).join(', ')
    anomalias.push({
      titulo: `Movimiento sin caja que no cierra (${d.dia.split('-').reverse().join('/')})`,
      detalle: `${que}. No pasó por ninguna caja y no tiene contrapartida ese día: ${d.neto > 0 ? 'entró plata que no está en ninguna caja' : 'salió plata de ninguna caja'}. Si la plata existió, falta registrar dónde está (o de dónde salió).`,
      monto: -d.neto,
    })
  }
  if (descuadres.length > 5) {
    const resto = descuadres.slice(5)
    anomalias.push({
      titulo: `${resto.length} días más con movimientos sin caja que no cierran`,
      detalle: `Entre el ${resto[resto.length - 1].dia.split('-').reverse().join('/')} y el ${resto[0].dia.split('-').reverse().join('/')}. Se ven mes por mes en la pestaña Capital.`,
      monto: -round2(resto.reduce((s, d) => s + d.neto, 0)),
    })
  }
  const otrosSinClasificar = ctx.movs.filter(m => m.categoria === 'other' && affectsBalance(m) && !ctx.transfer.has(m._key) && m._day >= PISO_HISTORIA)
  if (otrosSinClasificar.length) {
    const ing = otrosSinClasificar.filter(m => m._s > 0).reduce((s, m) => s + m._s, 0)
    const egr = otrosSinClasificar.filter(m => m._s < 0).reduce((s, m) => s - m._s, 0)
    anomalias.push({
      titulo: `${otrosSinClasificar.length} movimientos con categoría "otro"`,
      detalle: `Entraron ${money(round2(ing))} y salieron ${money(round2(egr))} sin categoría. No cuentan como ganancia: si alguno es una venta, comisión o aporte, recategorizarlo cambia los números del mes.`,
      monto: null,
    })
  }
  const prestamoSinVincular = ctx.movs.filter(m => ['loan', 'loan_disbursement', 'loan_repayment'].includes(m.categoria) && coerceId(m.prestamo_id) === null)
  if (prestamoSinVincular.length) {
    anomalias.push({
      titulo: `${prestamoSinVincular.length} movimientos de préstamo sin préstamo vinculado`,
      detalle: 'Un préstamo recibido sin prestamo_id suma caja sin sumar deuda (infla el capital); un repago sin vincular hace lo contrario.',
      monto: round2(prestamoSinVincular.reduce((s, m) => s + m._s, 0)),
    })
  }
  const dif = puentes.total.lineas.diferencias
  if (Math.abs(dif) >= 1) {
    anomalias.push({
      titulo: 'Diferencias de registro en el capital',
      detalle: 'Desde el inicio, el capital se movió por cosas que ningún movimiento explica (ver la línea "Diferencias de registro" del puente, mes por mes).',
      monto: dif,
    })
  }

  const { valorAuto: _va, comisionPendiente: _cp, parteSocio: _ps, ...fotoHoy } = fHoy
  return {
    hoy, meses, mesActual,
    capital: {
      hoy: fHoy.capital,
      serie,
      inicioMes: capitalEn(addDays(`${mesActual}-01`, -1)),
      hace30: capitalEn(addDays(hoy, -30)),
      maximo,
    },
    fotoHoy,
    puentes, caja, resultado, gastos, topGastos,
    equilibrio: {
      mesesBase: base, estructuraProm, retirosProm, gastoFijoProm,
      margenPromAuto, autosPorMes: round2(vendidos6.length / Math.max(1, ultimos6.length)),
      comisionProm, consignacionesPorMes: round2(consig6 / Math.max(1, ultimos6.length)),
      resultadoProm: prom(m => resultado[m].neto),
      autosNecesarios, mesesDeCaja,
    },
    stock, prestamos, consignaciones, anios, anomalias,
  }
}
