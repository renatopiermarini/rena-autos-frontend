import { redirect } from 'next/navigation'
import { backendHabilitado } from '@/lib/backend'
import ChatClient from './ChatClient'

/**
 * Hablar con el bot desde el dashboard: la MISMA puerta que WhatsApp, pero web.
 *
 * La pantalla existe sólo si la instancia tiene backend (BACKEND_URL +
 * BACKEND_API_KEY) — el mismo gate que decide si el nav dibuja el ítem "Chat".
 * Sin las env, llegar acá es escribir la URL a mano: se vuelve al tablero, igual
 * que hace /mensajes cuando su instancia no la tiene.
 *
 * La lectura de las env pasa ACÁ, en el server component: BACKEND_API_KEY no
 * puede cruzar al browser (ver lib/backend.ts).
 */
export const dynamic = 'force-dynamic'

export default function ChatPage() {
  if (!backendHabilitado()) redirect('/')
  return <ChatClient />
}
