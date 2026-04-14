export const dynamic = 'force-dynamic'
import { getTareas, getVehicles } from '@/lib/kapso'
import TareasClient from './TareasClient'

export default async function Tareas() {
  const [tareas, vehicles] = await Promise.all([getTareas(), getVehicles()])
  return <TareasClient tareas={tareas} vehicles={vehicles} />
}
