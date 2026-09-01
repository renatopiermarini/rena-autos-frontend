import { redirect } from 'next/navigation'
import { getConfigNegocio, getCotizaciones } from '@/lib/kapso'
import { cotizacionesHabilitadas } from '@/lib/cotizaciones'
import CotizacionesClient from './CotizacionesClient'

// Cotizaciones con el colega: el bot (rena-autos-api, jobs/cotizaciones_colega)
// detecta en el chat de WhatsApp los pedidos ("amarok 2023 120000 km") y las
// respuestas con precio ("amarok 33") y llena la tabla `cotizaciones`. Acá el
// equipo ve las pendientes y las marca como enviadas al cliente final.
export default async function Cotizaciones() {
  const [cotizaciones, config] = await Promise.all([getCotizaciones(), getConfigNegocio()])

  // Pantalla de la instancia de Renato (ver lib/cotizaciones.ts). En una
  // instancia con config cargada y sin `cotizaciones_colega=1` no existe: el
  // ítem del nav tampoco está, así que llegar acá es URL a mano o bookmark
  // viejo. Redirect al tablero, la misma regla que /mensajes.
  if (!cotizacionesHabilitadas(config)) redirect('/')

  return <CotizacionesClient cotizaciones={cotizaciones} />
}
