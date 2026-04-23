import { getBalances, getMovimientos, getPrestamos, getClientes, getVehicles } from '@/lib/kapso'
import FinanzasClient from './FinanzasClient'

export default async function Finanzas() {
  const [balances, movimientos, prestamos, clientes, vehicles] = await Promise.all([
    getBalances(), getMovimientos(), getPrestamos(), getClientes(), getVehicles(),
  ])
  return (
    <FinanzasClient
      balances={balances}
      movimientos={movimientos}
      prestamos={prestamos}
      clientes={clientes}
      vehicles={vehicles}
    />
  )
}
