/**
 * Conversores entre lo que se guarda en config_negocio (todo TEXT) y lo que se
 * edita en pantalla. Módulo puro: se testea sin DOM.
 */

/** `stock_keywords` se guarda como array JSON; se edita una palabra por línea. */
export function keywordsToText(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String).join('\n')
  } catch {
    // Valor viejo escrito a mano (CSV, texto suelto): se muestra tal cual en vez
    // de perderlo. Al guardar se normaliza a JSON.
  }
  return raw
}

export function textToKeywords(text: string): string {
  return JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean))
}

/** null si parsea (o si está vacío, que es válido), o el motivo del error. */
export function jsonError(raw: string): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  try {
    JSON.parse(t)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'JSON inválido'
  }
}
