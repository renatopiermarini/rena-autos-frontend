import { getVehicles, getTareas, getClientes, getMovimientos, getPrestamos } from '@/lib/kapso'
import StockClient from './StockClient'

export default async function Stock() {
  const [vehicles, tareas, clientes, movimientos, prestamos] = await Promise.all([
    getVehicles(), getTareas(), getClientes(), getMovimientos(), getPrestamos(),
  ])
  return (
    <StockClient
      vehicles={vehicles}
      tareas={tareas}
      clientes={clientes}
      movimientos={movimientos}
      prestamos={prestamos}
    />
  )
}
