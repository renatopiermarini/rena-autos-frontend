import { getVehicles, getTramites, getTurnos } from '@/lib/kapso'
import DocumentacionClient from './DocumentacionClient'

export default async function Documentacion() {
  const [vehicles, tramites, turnos] = await Promise.all([
    getVehicles(),
    getTramites(),
    getTurnos(),
  ])
  return <DocumentacionClient vehicles={vehicles} tramites={tramites} turnos={turnos} />
}
