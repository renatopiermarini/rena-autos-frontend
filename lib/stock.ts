/**
 * Lo que hay que saber de un auto sin abrirlo — puro, para que lo usen igual la
 * tabla de /stock, la tarjeta de móvil y el Tablero.
 *
 * "Días en stock" es la métrica reina del rubro (los DMS argentinos la ponen en
 * la fila): un auto de 90 días es plata parada, y es lo primero que se mira
 * cuando se decide bajar el precio. Estaba escondida detrás de `hidden md:` —
 * justo en la pantalla donde más se mira el stock.
 */

import { estadoMeta, type BadgeVariant } from '@/lib/estados'
import { parseAny } from '@/lib/date'

/** Un auto que lleva más de esto en stock ya es un problema, no un dato. */
export const DIAS_STOCK_ALERTA = 45

/** Días desde el ingreso. `null` si no hay fecha de ingreso cargada. */
export function diasEnStock(fechaIngreso: any, ahora: number = Date.now()): number | null {
  const d = parseAny(typeof fechaIngreso === 'string' ? fechaIngreso : null)
  if (!d) return null
  const dias = Math.floor((ahora - d.getTime()) / 86400000)
  return dias < 0 ? 0 : dias
}

/** "12 días" / "1 día" / "" — el sustantivo entero, que "12d" nadie lo lee. */
export function etiquetaDias(dias: number | null): string {
  if (dias === null) return ''
  return `${dias} día${dias === 1 ? '' : 's'}`
}

function fmtMonto(n: any): string {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `$${v.toLocaleString('es-AR')}`
}

export type TarjetaVehiculo = {
  /** Línea 1: "Chevrolet Cruze 2018" — lo que la persona dice en voz alta. */
  titulo: string
  /** Línea 2: "AB123CD · Gris · 84.000 km" (sin los que falten). */
  detalle: string
  /** Línea 3: el precio grande. */
  precio: string
  /** El precio mostrado es el OBJETIVO, no el publicado: se atenúa. */
  precioEstimado: boolean
  estadoLabel: string
  estadoVariant: BadgeVariant
  dias: number | null
  diasLabel: string
  /** Pasó el umbral: el chip de días va en tono de alerta. */
  diasAlerta: boolean
}

/**
 * Todo lo que muestra la tarjeta de un auto, en un solo lugar.
 *
 * El precio sigue la MISMA regla que la columna de la tabla: publicado primero,
 * objetivo como estimado, "—" si no hay ninguno. Nunca se inventa un número.
 */
export function tarjetaVehiculo(v: any, ahora: number = Date.now()): TarjetaVehiculo {
  const titulo = [v?.marca, v?.modelo, v?.año].map((x: any) => (x == null ? '' : String(x).trim()))
    .filter(Boolean).join(' ') || 'Auto sin datos'

  const km = v?.km ? `${Number(v.km).toLocaleString('es-AR')} km` : ''
  const detalle = [v?.dominio || 'sin patente', v?.color, km]
    .map((x: any) => (x == null ? '' : String(x).trim()))
    .filter(Boolean)
    .join(' · ')

  const publicado = v?.precio_publicado
  const objetivo = v?.precio_venta_objetivo
  const precioEstimado = !publicado && !!objetivo
  const precio = publicado ? fmtMonto(publicado) : objetivo ? fmtMonto(objetivo) : '—'

  const meta = estadoMeta(v?.estado)
  const dias = diasEnStock(v?.fecha_ingreso, ahora)

  return {
    titulo,
    detalle,
    precio,
    precioEstimado,
    estadoLabel: meta.label,
    estadoVariant: meta.variant,
    dias,
    diasLabel: etiquetaDias(dias),
    diasAlerta: dias !== null && dias > DIAS_STOCK_ALERTA,
  }
}
