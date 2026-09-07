/**
 * Cruzar lo que la IA leyó ("el Golf", "AB123CD") contra lo que la pantalla ya
 * tiene cargado, y armar los catálogos que se le mandan a `parsear-agenda`
 * para que resuelva ids en vez de nombres.
 *
 * Módulo PURO (sin Next, sin fetch, sin DOM): lo usan el form de interesados
 * (auto de interés), los "Agregar rápido" de Visitas/Tareas y los tests.
 */

export type VehiculoLike = {
  id: number | string
  marca?: string | null
  modelo?: string | null
  año?: number | string | null
  anio?: number | string | null
  dominio?: string | null
  estado?: string | null
}

export type InteresadoLike = {
  id: number | string
  nombre?: string | null
  telefono?: string | null
}

export type CatalogoItem = { id: number; label: string }

/** Minúsculas, sin acentos, un solo espacio: "Citroën  C4" y "citroen c4" son lo mismo. */
export function normalizarTexto(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** "ab 123-cd" → "AB123CD". Las patentes se comparan sin espacios ni guiones. */
export function normalizarDominioMatch(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[\s-]+/g, '')
}

function idNumerico(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * ¿Qué auto del stock es el que la IA describe?
 *
 *   1. Por dominio, si vino: match exacto (sin espacios, sin guiones).
 *   2. Por marca + modelo (o sólo modelo): una palabra contenida en la otra,
 *      así "Golf" encuentra "Golf GTI" y "Hilux SRX" encuentra "Hilux".
 *
 * Los vendidos se miran ÚLTIMOS: si hay un candidato en stock y otro vendido,
 * es el que está en stock. Si la ambigüedad persiste (dos Golf en stock),
 * devuelve null: mejor el select vacío que el auto equivocado.
 */
export function matchVehiculo(
  vehicles: VehiculoLike[],
  pista: { dominio?: string | null; marca?: string | null; modelo?: string | null },
): number | null {
  const dominio = normalizarDominioMatch(pista.dominio)
  if (dominio) {
    const v = vehicles.find(x => normalizarDominioMatch(x.dominio) === dominio)
    if (v) return idNumerico(v.id)
  }

  const marca = normalizarTexto(pista.marca)
  const modelo = normalizarTexto(pista.modelo)
  if (!marca && !modelo) return null

  const contiene = (a: string, b: string) => Boolean(a && b) && (a.includes(b) || b.includes(a))
  const candidatos = vehicles.filter(v => {
    const vm = normalizarTexto(v.marca)
    const vmod = normalizarTexto(v.modelo)
    const marcaOk = !marca || contiene(vm, marca)
    const modeloOk = !modelo || contiene(vmod, modelo)
    // Sólo marca sin modelo: demasiado ambiguo para elegir un auto.
    if (!modelo) return false
    return marcaOk && modeloOk
  })
  if (candidatos.length === 0) return null

  const enStock = candidatos.filter(v => v.estado !== 'vendido')
  const pool = enStock.length > 0 ? enStock : candidatos
  return pool.length === 1 ? idNumerico(pool[0].id) : null
}

/** "Toyota Hilux GR 2021 · AH204EZ" — la etiqueta que la IA ve para elegir un id. */
export function labelVehiculo(v: VehiculoLike): string {
  const auto = [v.marca, v.modelo, v.año ?? v.anio].map(x => String(x ?? '').trim()).filter(Boolean).join(' ')
  const dominio = String(v.dominio ?? '').trim()
  return dominio ? `${auto} · ${dominio}` : auto
}

/** El catálogo de autos para `parsear-agenda`: sólo los que NO están vendidos. */
export function catalogoVehiculos(vehicles: VehiculoLike[]): CatalogoItem[] {
  const salida: CatalogoItem[] = []
  for (const v of vehicles) {
    if (v.estado === 'vendido') continue
    const id = idNumerico(v.id)
    if (id === null) continue
    salida.push({ id, label: labelVehiculo(v) })
  }
  return salida
}

/** "Juan Pérez · 11 5555-1234" — con el teléfono, que es como el usuario suele nombrarlos. */
export function catalogoInteresados(interesados: InteresadoLike[]): CatalogoItem[] {
  const salida: CatalogoItem[] = []
  for (const i of interesados) {
    const id = idNumerico(i.id)
    if (id === null) continue
    const nombre = String(i.nombre ?? '').trim()
    const tel = String(i.telefono ?? '').trim()
    const label = [nombre || `interesado #${id}`, tel].filter(Boolean).join(' · ')
    salida.push({ id, label })
  }
  return salida
}
