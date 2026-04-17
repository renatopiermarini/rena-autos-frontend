import { getVehicles, getTareas, getClientes } from '@/lib/kapso'
import StockClient from './StockClient'

export default async function Stock() {
  const [vehicles, tareas, clientes] = await Promise.all([getVehicles(), getTareas(), getClientes()])
  return <StockClient vehicles={vehicles} tareas={tareas} clientes={clientes} />
}
