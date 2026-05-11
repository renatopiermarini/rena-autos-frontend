import { getVerificaciones, getVehicles } from '@/lib/kapso'
import VerificacionesClient from './VerificacionesClient'

export default async function Verificaciones() {
  const [verificaciones, vehicles] = await Promise.all([
    getVerificaciones(),
    getVehicles(),
  ])
  return <VerificacionesClient verificaciones={verificaciones} vehicles={vehicles} />
}
