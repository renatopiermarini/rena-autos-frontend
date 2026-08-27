/**
 * Registrar la venta de un auto DESDE EL DASHBOARD.
 *
 * Módulo PURO (sin Next, sin fetch, sin env): arma el PATCH del vehículo y los
 * movimientos de caja que lo acompañan; el diálogo de /stock los dispara y los
 * tests fijan las reglas. La validación de verdad la hacen el proxy
 * (/api/db/vehicles) y /api/finanzas/movimiento — esto es el espejo
 * client-side, para que el error se vea antes de viajar.
 *
 * LA REGLA QUE JUSTIFICA ESTE ARCHIVO (la plata de una consignación no es
 * nuestra):
 *
 *   - tipo_operacion='propio'        → el auto era de la agencia: entra el
 *     PRECIO ENTERO como ingreso categoría 'venta'.
 *   - tipo_operacion='consignacion'  → el auto es de un cliente: NO entra el
 *     precio. Entra sólo la COMISIÓN (ingreso categoría 'commission'); el resto
 *     es del dueño y se le liquida aparte. Meter el precio entero acá infla la
 *     caja con plata ajena, que es exactamente el error que este módulo existe
 *     para no cometer.
 *
 * Opcionalmente, en una consignación con gastos adelantados por la agencia
 * (client_expense del auto), se cobra también ese reintegro: ingreso categoría
 * 'client_repayment' a nombre del DUEÑO — la misma cuenta corriente que lee
 * computePatrimonio().por_cobrar.clientes.
 *
 * La comisión y su redondeo son los de computeLiquidacionConsignacion()
 * (lib/kapso.ts): round2(precio * pct / 100), pct de
 * config_negocio.comision_consignacion_pct. Espejo del backend
 * tools/analisis_tool.py (liquidacion_consignacion).
 */
import { round2 } from './kapso'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Default del % de comisión. Mismo número que el backend
 * (analisis_tool.py: `float(data.get("comision_pct") or 5)`) y que el seed del
 * perfil (scripts/seed_profile.py).
 */
export const COMISION_PCT_DEFAULT = 5

export type VentaForm = {
  precio_venta_final: string
  fecha_venta: string
  comprador_id: string
  cuenta: string
  /** Sólo consignación: cobrar además los gastos adelantados por la agencia. */
  cobrar_gastos: boolean
}

export const VENTA_FORM_VACIO: VentaForm = {
  precio_venta_final: '', fecha_venta: '', comprador_id: '', cuenta: '',
  cobrar_gastos: false,
}

export type VentaDesglose = {
  es_consignacion: boolean
  precio: number
  comision_pct: number
  /** Lo que entra a la caja por la venta (precio si es propio, comisión si no). */
  entra_a_caja: number
  comision: number
  gastos_adelantados: number
  /** Lo que le queda al dueño de la consignación, sin descontar gastos. */
  resto_dueno: number
  /** Lo que le queda al dueño una vez descontados comisión Y gastos. */
  neto_al_dueno: number
}

export type VentaPlan = {
  ok: true
  /** PATCH a /api/db/vehicles?id=N. */
  patch: Record<string, any>
  /** Bodies para POST /api/finanzas/movimiento, en orden. */
  movimientos: Record<string, any>[]
  desglose: VentaDesglose
}
export type VentaError = { ok: false; error: string }
export type VentaResult = VentaPlan | VentaError

const err = (error: string): VentaError => ({ ok: false, error })

function idPositivo(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * % de comisión de config_negocio. Es PORCENTAJE, no fracción: "5" = 5%
 * (así lo etiqueta /config/negocio y así lo guarda el seed). Cualquier valor
 * que no sea un número usable cae en 5, igual que el `or 5` del backend.
 */
export function comisionConsignacionPct(config?: Record<string, string>): number {
  const n = Number((config?.comision_consignacion_pct ?? '').toString().trim())
  if (!Number.isFinite(n) || n <= 0 || n > 100) return COMISION_PCT_DEFAULT
  return n
}

/** round2(precio * pct / 100) — mismo cálculo y mismo redondeo que la liquidación. */
export function comisionVenta(precio: number, pct: number): number {
  return round2(precio * pct / 100)
}

/** "Chevrolet Cruze (AB123CD)" para la descripción del movimiento. */
export function autoLabelVenta(v: any): string {
  const base = `${v?.marca ?? ''} ${v?.modelo ?? ''}`.trim()
  const dom = String(v?.dominio ?? '').trim()
  return (dom ? `${base} (${dom})` : base).trim()
}

/**
 * Arma la venta completa: el PATCH del vehículo + los movimientos de caja.
 *
 * @param vehiculo  la fila del auto (necesita id, tipo_operacion, cliente_id)
 * @param opts.comisionPct        % de config_negocio (comisionConsignacionPct)
 * @param opts.gastosAdelantados  gastos_adelantados de
 *   computeLiquidacionConsignacion(): NO se recalcula acá para no tener dos
 *   definiciones de "lo que la agencia puso por el dueño".
 */
export function planVenta(
  form: VentaForm,
  vehiculo: any,
  opts: { comisionPct: number; gastosAdelantados: number; nowIso: string },
): VentaResult {
  const vehicleId = idPositivo(vehiculo?.id)
  if (vehicleId === null) return err('El auto no tiene id — no se puede registrar la venta.')

  const precioRaw = (form.precio_venta_final ?? '').trim()
  if (precioRaw === '') return err('El precio de venta es obligatorio.')
  const precio = Number(precioRaw)
  if (!Number.isFinite(precio)) return err('El precio de venta tiene que ser un número.')
  if (precio <= 0) return err('El precio de venta tiene que ser mayor que 0.')

  const cuenta = (form.cuenta ?? '').trim()
  if (!cuenta) return err('Elegí a qué cuenta entra la plata.')

  const fecha = (form.fecha_venta ?? '').trim()
  if (fecha !== '' && !FECHA_RE.test(fecha)) {
    return err(`Fecha de venta inválida: ${JSON.stringify(fecha)}. Se espera YYYY-MM-DD.`)
  }

  const esConsignacion = String(vehiculo?.tipo_operacion ?? '') === 'consignacion'
  const pct = Number.isFinite(opts.comisionPct) && opts.comisionPct > 0
    ? opts.comisionPct
    : COMISION_PCT_DEFAULT
  const gastos = round2(Math.max(0, Number(opts.gastosAdelantados ?? 0) || 0))
  const comision = esConsignacion ? comisionVenta(precio, pct) : 0
  const duenoId = idPositivo(vehiculo?.cliente_id)

  const cobrarGastos = esConsignacion && form.cobrar_gastos === true && gastos > 0
  if (cobrarGastos && duenoId === null) {
    // client_repayment SIN cliente lo rechaza validarMovimiento (guard 1d), y
    // además la cuenta corriente quedaría sin a quién descontarle el reintegro.
    return err('La consignación no tiene cliente dueño: no se puede cobrar el reintegro de gastos.')
  }

  const patch: Record<string, any> = {
    estado: 'vendido',
    precio_venta_final: round2(precio),
    updated_at: opts.nowIso,
  }
  if (fecha) patch.fecha_venta = fecha
  const compradorId = idPositivo(form.comprador_id)
  if (compradorId !== null) patch.comprador_id = compradorId

  const label = autoLabelVenta(vehiculo)
  const movimientos: Record<string, any>[] = []

  // La fecha del asiento es el día de la VENTA, no el día que se abrió la
  // pantalla (validarMovimiento ancla una fecha pasada al mediodía AR).
  const conFecha = (body: Record<string, any>) => (fecha ? { ...body, fecha } : body)

  if (esConsignacion) {
    if (comision > 0) {
      movimientos.push(conFecha({
        tipo: 'ingreso',
        categoria: 'commission',
        monto: comision,
        vehicle_id: vehicleId,
        cuenta,
        descripcion: `Comisión ${pct}% venta ${label}`.trim(),
      }))
    }
    if (cobrarGastos) {
      movimientos.push(conFecha({
        tipo: 'ingreso',
        categoria: 'client_repayment',
        monto: gastos,
        vehicle_id: vehicleId,
        cliente_id: duenoId,
        cuenta,
        descripcion: `Reintegro de gastos adelantados ${label}`.trim(),
      }))
    }
  } else {
    movimientos.push(conFecha({
      tipo: 'ingreso',
      categoria: 'venta',
      monto: round2(precio),
      vehicle_id: vehicleId,
      cuenta,
      descripcion: `Venta ${label}`.trim(),
    }))
  }

  return {
    ok: true,
    patch,
    movimientos,
    desglose: {
      es_consignacion: esConsignacion,
      precio: round2(precio),
      comision_pct: pct,
      entra_a_caja: esConsignacion ? round2(comision + (cobrarGastos ? gastos : 0)) : round2(precio),
      comision,
      gastos_adelantados: gastos,
      resto_dueno: round2(precio - comision),
      neto_al_dueno: round2(precio - comision - gastos),
    },
  }
}
