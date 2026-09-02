import { notFound } from 'next/navigation'
import { backendHabilitado } from '@/lib/backend'
import ChatClient from './ChatClient'

/**
 * Hablar con el bot desde el dashboard: la MISMA puerta que WhatsApp, pero web.
 *
 * La pantalla existe sólo si la instancia tiene backend (BACKEND_URL +
 * BACKEND_API_KEY) — el mismo gate que decide si el nav dibuja el ítem "Chat".
 * Sin las env es un 404, no un redirect al tablero: el redirect silencioso
 * hacía que /chat pareciera una ruta catch-all rota en vez de una pantalla
 * que esta instancia no tiene (QA 2026-09-02).
 *
 * La lectura de las env pasa ACÁ, en el server component: BACKEND_API_KEY no
 * puede cruzar al browser (ver lib/backend.ts).
 */
export const dynamic = 'force-dynamic'

export default function ChatPage() {
  if (!backendHabilitado()) notFound()
  return <ChatClient />
}
