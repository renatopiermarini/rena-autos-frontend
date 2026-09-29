/**
 * Formato único de plata para todo el dashboard.
 *
 * Todos los montos del negocio son USD, pero la mitad de las pantallas los
 * mostraba con "$" pelado — que en Argentina se lee PESOS — y la otra mitad
 * con "USD". Tres personas comparten estas pantallas y las dos lecturas
 * difieren ~1000×. Acá se decide una sola vez: prefijo "USD" siempre.
 *
 * Redondeo, una sola regla: los enteros se muestran enteros y los montos con
 * centavos muestran SIEMPRE dos decimales ("USD 5.094,33"), nunca uno solo
 * ("$103.963,9" era un formateador distinto por pantalla).
 */
export function money(n: unknown): string {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const opts = Number.isInteger(v)
    ? undefined
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return `USD ${v.toLocaleString('es-AR', opts)}`
}

/**
 * Números que NO son plata (km, cantidades): mismo agrupado es-AR, sin prefijo.
 * Vive acá para que todo formateo numérico tenga una sola casa.
 */
export function fmtN(n: unknown): string {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-AR')
}

/**
 * Plata compacta para ejes y etiquetas de gráficos, donde "USD 12.500" no
 * entra: "12,5k", "−3k", "850". Signo menos tipográfico. Fuera de un gráfico,
 * siempre money().
 */
export function moneyK(n: unknown): string {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (abs < 1000) return `${sign}${Math.round(abs).toLocaleString('es-AR')}`
  const k = abs / 1000
  const txt = k >= 100 ? Math.round(k).toLocaleString('es-AR') : k.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return `${sign}${txt}k`
}

/** money() con signo explícito para variaciones: "+USD 1.200" / "−USD 800". */
export function moneyDelta(n: unknown): string {
  const v = Number(n)
  if (n == null || n === '' || !Number.isFinite(v)) return '—'
  if (Math.abs(v) < 0.005) return money(0)
  return `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`
}
