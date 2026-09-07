/**
 * Registrar la venta de un auto DESDE EL DASHBOARD.
 *
 * Módulo PURO (sin Next, sin fetch, sin env): arma el PATCH del vehículo y el
 * DESGLOSE de lo que hay que asentar en caja; el diálogo de /stock dispara el
 * PATCH y muestra el desglose. La validación de verdad la hace el proxy
 * (/api/db/vehicles) — esto es el espejo client-side, para que el error se vea
 * antes de viajar.
 *
 * El dashboard NO escribe los movimientos: Finanzas es solo consulta y los
 * asientos los carga Claude por SQL sobre la base. Lo que este módulo produce
 * es el texto que se le pega a Claude ("Para registrar con Claude"), con la
 * misma regla de siempre para que nadie infle la caja con plata ajena:
 *
 *   - tipo_operacion='propio'        → el auto era de la agencia: entra el
 *     PRECIO ENTERO como ingreso categoría 'venta'.
 *   - tipo_operacion='consignacion'  → el auto es de un cliente: NO entra el
 *     precio. Entra sólo la COMISIÓN (ingreso categoría 'commission'); el resto
 *     es del dueño y se le liquida aparte.
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
import { money } from './money'

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
  /** Sólo consignación: cobrar además los gastos adelantados por la agencia. */
  cobrar_gastos: boolean
}

export const VENTA_FORM_VACIO: VentaForm = {
  precio_venta_final: '', fecha_venta: '', comprador_id: '',
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

/**
 * Un asiento que Claude tiene que cargar en movimientos_contabilidad. Es
 * INFORMATIVO: el dashboard no lo escribe, lo muestra (y lo copia).
 */
export type VentaAsiento = {
  categoria: 'venta' | 'commission' | 'client_repayment'
  monto: number
  /** Sólo client_repayment: el dueño de la consignación. */
  cliente_id?: number
}

export type VentaPlan = {
  ok: true
  /** PATCH a /api/db/vehicles?id=N. */
  patch: Record<string, any>
  /** Lo que hay que registrar en caja, en orden. Informativo, no se POSTea. */
  asientos: VentaAsiento[]
  /** Texto plano para pegarle a Claude: los asientos de arriba, legibles. */
  paraClaude: string
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
 * Arma la venta completa: el PATCH del vehículo + el desglose de caja
 * (informativo: lo asienta Claude, ver textoParaClaude).
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
    // Un client_repayment sin cliente no tiene a quién descontarle el reintegro
    // en la cuenta corriente: el backend lo rechaza (guard 1d) y Claude también.
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

  const asientos: VentaAsiento[] = []
  if (esConsignacion) {
    if (comision > 0) asientos.push({ categoria: 'commission', monto: comision })
    if (cobrarGastos) asientos.push({ categoria: 'client_repayment', monto: gastos, cliente_id: duenoId! })
  } else {
    asientos.push({ categoria: 'venta', monto: round2(precio) })
  }

  return {
    ok: true,
    patch,
    asientos,
    paraClaude: textoParaClaude(vehiculo, vehicleId, fecha, esConsignacion, pct, asientos),
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

/**
 * El bloque "Para registrar con Claude": una línea por asiento, con el auto, su
 * id y la fecha de la VENTA (no la de hoy) para que el INSERT salga sin
 * preguntar. Ejemplo:
 *
 *   Venta Chevrolet Cruze (AB123CD) [vehicle_id 7] — 2026-08-27
 *   - ingreso USD 10.000 (venta)
 */
function textoParaClaude(
  vehiculo: any,
  vehicleId: number,
  fecha: string,
  esConsignacion: boolean,
  pct: number,
  asientos: VentaAsiento[],
): string {
  const cabecera = [
    `Venta ${autoLabelVenta(vehiculo)} [vehicle_id ${vehicleId}]`,
    esConsignacion ? 'consignación' : null,
    fecha || null,
  ].filter(Boolean).join(' — ')
  const lineas = asientos.map(a => {
    const detalle = a.categoria === 'commission'
      ? `commission, ${pct}%`
      : a.categoria === 'client_repayment'
        ? `client_repayment, cliente_id ${a.cliente_id}`
        : 'venta'
    return `- ingreso ${money(a.monto)} (${detalle})`
  })
  return [cabecera, ...lineas].join('\n')
}
