export const dynamic = 'force-dynamic'
import { getTransferencias, getClientes, getVehicles } from '@/lib/kapso'
import TransferenciasClient from './TransferenciasClient'

export default async function Transferencias() {
  const [transferencias, clientes, vehicles] = await Promise.all([
    getTransferencias(),
    getClientes(),
    getVehicles(),
  ])
  return <TransferenciasClient transferencias={transferencias} clientes={clientes} vehicles={vehicles} />
}
