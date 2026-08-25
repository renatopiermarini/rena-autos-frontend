import { getTareas, getVehicles, getEquipo, getConfigNegocio } from '@/lib/kapso'
import { destacadosClaves, equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import TareasClient from './TareasClient'

export default async function Tareas() {
  const [tareas, vehicles, equipoRows, config] = await Promise.all([
    getTareas(), getVehicles(), getEquipo(), getConfigNegocio(),
  ])
  // Sin la tabla `equipo` esto devuelve rena/fran/marshiot con sus colores de
  // siempre, y el asignado por defecto sigue siendo rena.
  const equipo = equipoFromRows(equipoRows)
  const defAssignee = resolveDefaultAssignee(config, equipo)
  return (
    <TareasClient
      tareas={tareas}
      vehicles={vehicles}
      equipo={equipo}
      defAssignee={defAssignee}
      destacados={destacadosClaves(config, equipo, defAssignee)}
    />
  )
}
