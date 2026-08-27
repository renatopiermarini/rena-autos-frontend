import {
  getVehicles, getTareas, getClientes, getMovimientos, getPrestamos,
  getEquipo, getConfigNegocio, getCuentas, cuentasInfo,
} from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import { comisionConsignacionPct } from '@/lib/venta'
import StockClient from './StockClient'

export default async function Stock() {
  // `cuentas` es para el alta y para la venta: hay que elegir de qué caja sale
  // la compra y a cuál entra el ingreso. Sin la tabla, cuentasInfo cae en las
  // tres de siempre (cash/nexo/fiwind).
  const [vehicles, tareas, clientes, movimientos, prestamos, equipoRows, config, cuentasRows] =
    await Promise.all([
      getVehicles(), getTareas(), getClientes(), getMovimientos(), getPrestamos(),
      getEquipo(), getConfigNegocio(), getCuentas(),
    ])
  return (
    <StockClient
      vehicles={vehicles}
      tareas={tareas}
      clientes={clientes}
      movimientos={movimientos}
      prestamos={prestamos}
      defAssignee={resolveDefaultAssignee(config, equipoFromRows(equipoRows))}
      cuentas={cuentasInfo(cuentasRows)}
      comisionPct={comisionConsignacionPct(config)}
    />
  )
}
