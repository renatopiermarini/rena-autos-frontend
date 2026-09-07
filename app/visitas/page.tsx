import { getVisitas, getVehicles, getInteresados } from '@/lib/kapso'
import VisitasClient from './VisitasClient'
import { backendHabilitado } from '@/lib/backend'

export default async function Visitas() {
  const [visitas, vehicles, interesados] = await Promise.all([
    getVisitas(), getVehicles(), getInteresados(),
  ])
  return <VisitasClient visitas={visitas} vehicles={vehicles} interesados={interesados} ia={backendHabilitado()} />
}
