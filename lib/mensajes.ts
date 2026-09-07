/**
 * "Mensajes frecuentes": las plantillas de texto que el equipo copia y pega en
 * WhatsApp para contestar clientes.
 *
 * NO son una tabla nueva. Viven en `kb_entries` con `tipo='plantilla'` — la
 * misma tabla que el bot usa como base de conocimiento — así las plantillas que
 * Renato ya cargó aparecen solas el día que se publica la pantalla. Los otros
 * tipos (proceso, faq, leccion_aprendida) siguen existiendo para el bot y NO se
 * muestran acá: esta pantalla no es la vieja Guía con otro nombre.
 *
 * Módulo PURO (sin Next, sin fetch, sin DOM): lo usan la page (server) y el
 * client component.
 */

/** El `tipo` de kb_entries que esta pantalla lee y escribe. Nunca otro. */
export const TIPO_PLANTILLA = 'plantilla'

export type Plantilla = {
  id: number
  titulo: string | null
  contenido: string
  tags: string | null
  autor: string | null
  updated_at?: string | null
}

/**
 * Filas crudas de kb_entries → sólo las plantillas, normalizadas y ordenadas
 * alfabéticamente por su título visible.
 *
 * Alfabético y no "la última editada primero": son pocas y se buscan por
 * nombre; si el orden baila entre visitas, el pulgar tiene que volver a leer
 * la lista entera cada vez.
 *
 * Se descartan las filas sin id numérico (no se podrían editar ni borrar) y las
 * que quedaron sin texto: una tarjeta cuyo botón "Copiar" copia nada es peor
 * que no mostrarla.
 */
export function plantillasDe(rows: any[]): Plantilla[] {
  if (!Array.isArray(rows)) return []
  const out: Plantilla[] = []
  for (const r of rows) {
    if (r?.tipo !== TIPO_PLANTILLA) continue
    // D1 devuelve los ids como TEXT ("7") tanto como number, así que se coerce.
    // Ojo con Number(null) === 0: sin descartar los vacíos primero, una fila sin
    // id entraría como id 0 y el PATCH/DELETE iría contra una fila inexistente.
    const rawId = r?.id
    if (rawId === null || rawId === undefined || rawId === '') continue
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const contenido = typeof r?.contenido === 'string' ? r.contenido : ''
    if (!contenido.trim()) continue
    out.push({
      id,
      titulo: typeof r?.titulo === 'string' && r.titulo.trim() ? r.titulo.trim() : null,
      contenido,
      tags: typeof r?.tags === 'string' && r.tags.trim() ? r.tags.trim() : null,
      autor: typeof r?.autor === 'string' && r.autor.trim() ? r.autor.trim() : null,
      updated_at: r?.updated_at ?? null,
    })
  }
  return out.sort((a, b) =>
    tituloPlantilla(a).localeCompare(tituloPlantilla(b), 'es', { sensitivity: 'base' }))
}

/** Hasta acá llega el título derivado antes de cortarse con puntos suspensivos. */
const TITULO_MAX = 60

/**
 * Cómo se llama la plantilla en la lista. El título es opcional a propósito
 * (pegar el texto y guardar tiene que alcanzar), así que sin título se usa la
 * primera línea con contenido — que es, en la práctica, el saludo o el asunto.
 */
export function tituloPlantilla(p: Pick<Plantilla, 'titulo' | 'contenido'>): string {
  if (p.titulo && p.titulo.trim()) return p.titulo.trim()
  const linea = (p.contenido ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
  if (!linea) return '(sin título)'
  return linea.length > TITULO_MAX ? `${linea.slice(0, TITULO_MAX).trimEnd()}…` : linea
}

/** "seña, papeles" → ['seña','papeles']. Vacío si la columna está vacía. */
export function tagsDe(p: Pick<Plantilla, 'tags'>): string[] {
  return (p.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
}

/**
 * Normaliza para buscar: minúsculas y SIN acentos. Buscar "senas" tiene que
 * encontrar "señas" — el que busca desde el celular no va a poner el acento.
 */
function fold(s: string): string {
  // Rango de "combining diacritical marks" y no \p{Diacritic}: la property
  // escape necesita target ES2018 y este tsconfig apunta más abajo.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Busca en título, texto y tags. Query vacía ⇒ la lista tal cual. */
export function filtrarPlantillas(list: Plantilla[], query: string): Plantilla[] {
  const q = fold((query ?? '').trim())
  if (!q) return list
  return list.filter(p =>
    fold(`${tituloPlantilla(p)} ${p.contenido} ${p.tags ?? ''}`).includes(q))
}

/** Líneas de preview antes de ofrecer "Ver completo" (espeja el line-clamp-3). */
const PREVIEW_LINEAS = 3
const PREVIEW_CHARS = 140

/**
 * ¿Vale la pena ofrecer el "Ver completo"? Sin esto el botón aparece hasta en
 * una plantilla de un renglón, que es ruido. Es una heurística (el line-clamp
 * real depende del ancho), pero falla del lado seguro: en la duda, muestra.
 */
export function esLargo(contenido: string): boolean {
  const texto = contenido ?? ''
  return texto.split('\n').length > PREVIEW_LINEAS || texto.length > PREVIEW_CHARS
}
