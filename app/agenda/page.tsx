import { getTareas, getVisitas, getTransferencias, getVehicles, getInteresados } from '@/lib/kapso'
import AgendaClient from './AgendaClient'

export default async function Agenda() {
  const [tareas, visitas, transferencias, vehicles, interesados] = await Promise.all([
    getTareas(), getVisitas(), getTransferencias(), getVehicles(), getInteresados(),
  ])
  return (
    <AgendaClient
      tareas={tareas}
      visitas={visitas}
      transferencias={transferencias}
      vehicles={vehicles}
      interesados={interesados}
    />
  )
}
