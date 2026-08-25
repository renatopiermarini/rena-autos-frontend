import {
  getVehicles, getTareas, getClientes, getMovimientos, getPrestamos,
  getEquipo, getConfigNegocio,
} from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import StockClient from './StockClient'

export default async function Stock() {
  const [vehicles, tareas, clientes, movimientos, prestamos, equipoRows, config] = await Promise.all([
    getVehicles(), getTareas(), getClientes(), getMovimientos(), getPrestamos(),
    getEquipo(), getConfigNegocio(),
  ])
  return (
    <StockClient
      vehicles={vehicles}
      tareas={tareas}
      clientes={clientes}
      movimientos={movimientos}
      prestamos={prestamos}
      defAssignee={resolveDefaultAssignee(config, equipoFromRows(equipoRows))}
    />
  )
}
