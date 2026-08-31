// Verificaciones con vehicle_id null: pueden ser de un auto EXTERNO (no es
// nuestro, nunca se va a asignar) o estar SIN AUTO ASIGNADO todavía (el bot
// las guarda con `sin_auto` cuando Maxi no sabe de qué auto es). Se distinguen
// por el prefijo en `notas` — espejo de EXTERNO_PREFIX en
// rena-autos-api/tools/verificaciones_tools.py. Cambiar allá y acá.
export const EXTERNO_PREFIX = 'Auto externo'

// En modo Kapso/D1 las FK pueden venir como string vacío en vez de null.
const sinVehiculo = (v: any) => v?.vehicle_id == null || v?.vehicle_id === ''

export const esExterna = (v: any) =>
  sinVehiculo(v) && String(v?.notas ?? '').trimStart().startsWith(EXTERNO_PREFIX)

// Sin auto asignado → transitorio: el Tablero y la tabla lo alertan.
export const sinAuto = (v: any) => sinVehiculo(v) && !esExterna(v)
