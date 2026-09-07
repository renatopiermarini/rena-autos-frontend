/**
 * La campana de avisos del header: lo que el bot manda solo (recordatorios de
 * tareas, alertas de caja, nudges) y el número del globito rojo.
 *
 * Módulo PURO (sin Next, sin fetch, sin DOM): lo que acá se decide — hasta qué
 * id se marca leído, cómo se capa el globito, cómo se dice "hace 5 min" — es
 * lógica que tiene que poder probarse sin abrir un browser. El componente
 * (components/notificaciones-bell.tsx) sólo pinta lo que estas funciones
 * deciden.
 *
 * El contrato de los tipos espeja 1:1 el del backend (rena-autos-api
 * api/notificaciones.py `listar`).
 */

import { fmtDMY, parseInstant } from '@/lib/date'

// ── Tipos del contrato ────────────────────────────────────────────────────────

export type NotificacionNivel = 'info' | 'alerta' | string

export type Notificacion = {
  id: number
  texto: string
  nivel: NotificacionNivel
  link: string | null
  leida: boolean
  created_at?: string | null
}

// ── Tiempos ───────────────────────────────────────────────────────────────────

/**
 * "recién", "hace 5 min", "hace 3 h", "hace 2 d", y de ahí en adelante la fecha.
 *
 * Para la campana, donde lo que importa es "¿esto es de ahora o de la semana
 * pasada?" y no la hora exacta. `ahora` es parámetro para poder testearlo.
 */
export function tiempoRelativo(iso?: string | null, ahora: number = Date.now()): string {
  const d = parseInstant(iso)
  if (!d) return ''
  const seg = Math.round((ahora - d.getTime()) / 1000)
  // Un reloj adelantado del lado del cliente no tiene que mostrar "hace -3 min".
  if (seg < 60) return 'recién'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return `hace ${dias} d`
  return fmtDMY(iso)
}

// ── Marcar leídas ─────────────────────────────────────────────────────────────

/**
 * El id hasta el que se marca leído: el más alto que la lista llegó a PINTAR.
 *
 * No se usa el `last_id` de la respuesta ni el id más alto de la tabla: un aviso
 * que entró mientras el popover ya estaba abierto no se puede dar por visto sin
 * que nadie lo haya visto (así lo pide api/notificaciones.leer).
 */
export function hastaIdVisible(notificaciones: Notificacion[]): number {
  let max = 0
  for (const n of notificaciones ?? []) {
    const id = Number(n?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max
}

/** El número del globito, capado para que no rompa el layout. */
export function textoBadge(noLeidas: number): string {
  const n = Number(noLeidas)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}
