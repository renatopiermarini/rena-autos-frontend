import {
  getBalances, getMovimientos, getPrestamos, getClientes, getVehicles,
  getCuentas, getConfigNegocio, cuentasInfo, umbralAlertaCaja,
} from '@/lib/kapso'
import FinanzasClient from './FinanzasClient'

export default async function Finanzas() {
  const [balances, movimientos, prestamos, clientes, vehicles, cuentasRows, config] = await Promise.all([
    getBalances(), getMovimientos(), getPrestamos(), getClientes(), getVehicles(),
    getCuentas(), getConfigNegocio(),
  ])
  // Sin la tabla `cuentas`, cuentasInfo devuelve cash/nexo/fiwind con label =
  // clave: exactamente el texto que la pantalla tenía hardcodeado.
  const cuentas = cuentasInfo(cuentasRows)
  return (
    <FinanzasClient
      balances={balances}
      movimientos={movimientos}
      prestamos={prestamos}
      clientes={clientes}
      vehicles={vehicles}
      cuentas={cuentas}
      umbralCaja={umbralAlertaCaja(config)}
    />
  )
}
