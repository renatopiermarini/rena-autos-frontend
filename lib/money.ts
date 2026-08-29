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
