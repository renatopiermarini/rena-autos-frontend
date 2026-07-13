import { getTareas, getVisitas, getTransferencias, getTurnos, getVehicles, getInteresados } from '@/lib/kapso'
import AgendaClient from './AgendaClient'

export default async function Agenda() {
  const [tareas, visitas, transferencias, turnos, vehicles, interesados] = await Promise.all([
    getTareas(), getVisitas(), getTransferencias(), getTurnos(), getVehicles(), getInteresados(),
  ])
  return (
    <AgendaClient
      tareas={tareas}
      visitas={visitas}
      transferencias={transferencias}
      turnos={turnos}
      vehicles={vehicles}
      interesados={interesados}
    />
  )
}
