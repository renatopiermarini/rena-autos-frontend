import { getCotizaciones } from '@/lib/kapso'
import CotizacionesClient from './CotizacionesClient'

// Cotizaciones con el colega: el bot (rena-autos-api, jobs/cotizaciones_colega)
// detecta en el chat de WhatsApp los pedidos ("amarok 2023 120000 km") y las
// respuestas con precio ("amarok 33") y llena la tabla `cotizaciones`. Acá el
// equipo ve las pendientes y las marca como enviadas al cliente final.
export default async function Cotizaciones() {
  const cotizaciones = await getCotizaciones()
  return <CotizacionesClient cotizaciones={cotizaciones} />
}
