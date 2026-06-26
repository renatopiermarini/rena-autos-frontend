import { getVisitas, getVehicles, getInteresados, getTransferencias } from '@/lib/kapso'
import VisitasClient from './VisitasClient'

export default async function Visitas() {
  const [visitas, vehicles, interesados, transferencias] = await Promise.all([
    getVisitas(), getVehicles(), getInteresados(), getTransferencias(),
  ])
  return <VisitasClient visitas={visitas} vehicles={vehicles} interesados={interesados} transferencias={transferencias} />
}
