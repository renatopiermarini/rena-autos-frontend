/**
 * Guardia compartida contra "cerré el diálogo y perdí todo lo que había cargado".
 *
 * En el celular un roce fuera del modal lo cerraba y el form volvía a cero sin
 * avisar: un alta de auto son doce campos. Acá vive la parte PURA (¿está sucio?
 * ¿qué se le pregunta?); el enganche con el Dialog está en components/ui/dialog.tsx
 * (`useDirtyClose`), que es lo único que tienen que importar las pantallas.
 *
 * DECISIÓN — se confirma en LAS CUATRO puertas de salida: Escape, click afuera,
 * la X y el botón "Cancelar".
 *   · Las dos primeras son accidentes puros y son las que motivaron el fix.
 *   · La X vive a 8px del borde del modal: en un pulgar es el mismo accidente.
 *   · "Cancelar" está pegado a "Guardar" en el footer; y para alguien no técnico
 *     "Cancelar" se lee como "cancelá este paso", no como "tirá los doce campos".
 * Una sola regla es además la que hace barato adoptar el hook: no hay que cablear
 * botón por botón, el diálogo entero queda protegido con dos líneas.
 *
 * Lo que NO pregunta: cerrar después de guardar bien (esas rutas llaman al
 * onOpenChange crudo, no al `cerrar` del hook) y los diálogos de sólo lectura
 * (confirmaciones de borrado): ahí no hay nada tipeado que perder.
 */

export const MENSAJE_DESCARTAR =
  'Tenés datos cargados sin guardar. ¿Querés descartarlos?'

/**
 * Normaliza un valor de form a string comparable. `''`, `null` y `undefined` son
 * todos "vacío": un campo que nunca se tocó no puede contar como cambio sólo
 * porque el estado inicial lo tenía en null y el input lo dejó en ''.
 */
function norm(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (Array.isArray(v)) return v.map(norm).join('')
  return String(v)
}

/**
 * ¿Cambió algo respecto de cómo abrió el diálogo?
 *
 * Comparación PLANA (un nivel) sobre la unión de las claves de los dos objetos:
 * los forms de este dashboard son records de strings/booleans/arrays de strings.
 * `inicial` NO es "el form vacío" sino el form tal cual quedó sembrado al abrir
 * (con la fecha de hoy, la cuenta por defecto, el auto del interesado…): sembrar
 * no es ensuciar.
 */
export function formSucio(
  actual: Record<string, unknown> | null | undefined,
  inicial: Record<string, unknown> | null | undefined,
): boolean {
  const a = actual ?? {}
  const b = inicial ?? {}
  const claves = Object.keys(a).concat(Object.keys(b).filter(k => !(k in a)))
  for (const k of claves) {
    if (norm(a[k]) !== norm(b[k])) return true
  }
  return false
}
