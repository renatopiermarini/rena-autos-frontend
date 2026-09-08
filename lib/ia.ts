/**
 * "La IA propone, el formulario confirma."
 *
 * Lo que devuelve `POST /api/ia/<accion>` no se guarda: se vuelca sobre el
 * formulario que ya existe, marcando qué campos vinieron sugeridos, y el humano
 * revisa y guarda por el camino de siempre. Este módulo es esa mecánica —
 * aplicar, marcar tocado, limpiar — sin React ni DOM, para que se pueda probar
 * en node. El componente sólo pinta el borde `info` en los campos del Set.
 *
 * Módulo PURO.
 */

export type CamposIa<T> = Set<keyof T>

/** ¿Este valor cuenta como "vacío" a la hora de llenar? */
function vacio(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

/**
 * Normaliza lo que la IA trae antes de ponerlo en el form: los strings se
 * recortan y el `dominio` va en mayúsculas y sin espacios (la IA a veces lee
 * "ab 123 cd" de una cédula; el backend valida contra AAA999 / AA999AA).
 *
 * El tipo se conserva: si el form guarda `anio` como string y la IA manda un
 * número, se convierte al tipo del valor actual del form para que el input
 * controlado no cambie de tipo a mitad de camino.
 */
function normalizar(campo: string, sugerido: unknown, actual: unknown): unknown {
  let v = sugerido
  if (typeof v === 'string') v = v.trim()
  if (campo === 'dominio' && typeof v === 'string') v = v.toUpperCase().replace(/\s+/g, '')
  if (typeof actual === 'string' && typeof v !== 'string') v = String(v)
  if (typeof actual === 'number' && typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) v = n
  }
  return v
}

/**
 * Vuelca `sugerido` sobre `form` y devuelve el form nuevo más el Set de campos
 * que la IA llenó.
 *
 * Reglas:
 *   · sólo llena campos VACÍOS del form (lo que el usuario ya escribió no se
 *     pisa), salvo `pisar: true`;
 *   · ignora `null`, `undefined` y strings vacíos: la IA no borra nada;
 *   · ignora claves que el form no tiene: el schema del backend puede traer
 *     más de lo que este formulario muestra;
 *   · normaliza (trim, dominio en mayúsculas).
 */
export function aplicarSugerencia<T extends Record<string, unknown>>(
  form: T,
  sugerido: Partial<Record<keyof T, unknown>>,
  opts: { pisar?: boolean } = {},
): { form: T; camposIa: CamposIa<T> } {
  const salida = { ...form }
  const camposIa: CamposIa<T> = new Set()
  for (const clave of Object.keys(sugerido ?? {}) as (keyof T)[]) {
    if (!(clave in form)) continue
    const valor = sugerido[clave]
    if (vacio(valor)) continue
    if (!opts.pisar && !vacio(form[clave])) continue
    const normalizado = normalizar(String(clave), valor, form[clave])
    if (vacio(normalizado)) continue
    salida[clave] = normalizado as T[keyof T]
    camposIa.add(clave)
  }
  return { form: salida, camposIa }
}

/**
 * El usuario tocó un campo: deja de ser "sugerido por IA". Devuelve un Set
 * nuevo (no muta) para que React vea el cambio.
 */
export function marcarTocado<T>(camposIa: CamposIa<T>, campo: keyof T): CamposIa<T> {
  if (!camposIa.has(campo)) return camposIa
  const salida = new Set(camposIa)
  salida.delete(campo)
  return salida
}

/**
 * "Limpiar sugerencias": los campos que la IA llenó vuelven a lo que tenían
 * antes (`inicial`); lo que el usuario escribió a mano queda. Devuelve el form
 * nuevo y un Set vacío.
 */
export function limpiarSugerencias<T extends Record<string, unknown>>(
  form: T,
  camposIa: CamposIa<T>,
  inicial: T,
): { form: T; camposIa: CamposIa<T> } {
  const salida = { ...form }
  camposIa.forEach(clave => {
    salida[clave] = inicial[clave]
  })
  return { form: salida, camposIa: new Set() }
}
