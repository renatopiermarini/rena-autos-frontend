/**
 * Memo con TTL a nivel módulo (una lambda tibia / el dev server). Para las
 * tablas de configuración (config_negocio, cuentas, equipo): el layout las lee
 * en CADA navegación y cambian una vez por mes. 30 s de staleness contra un
 * round-trip a Railway por página es un buen negocio; el proxy de escrituras
 * llama memoInvalidar() al tocar esas tablas, así el mismo proceso ve el cambio
 * al instante y los demás a los 30 s.
 *
 * La promesa se cachea (no el valor): dos lecturas simultáneas comparten el
 * viaje. Un rechazo se saca del cache para que el próximo intento reintente.
 */
const store = new Map<string, { at: number; p: Promise<unknown> }>()

export async function memoTtl<T>(key: string, ttlMs: number, fn: () => Promise<T>, ahora: number = Date.now()): Promise<T> {
  const hit = store.get(key)
  if (hit && ahora - hit.at < ttlMs) return hit.p as Promise<T>
  const p = fn().catch(e => {
    if (store.get(key)?.p === p) store.delete(key)
    throw e
  })
  store.set(key, { at: ahora, p })
  return p
}

/** Sin clave, borra todo. */
export function memoInvalidar(key?: string): void {
  if (key === undefined) store.clear()
  else store.delete(key)
}

/** Sólo para tests. */
export function __memoSize(): number {
  return store.size
}
