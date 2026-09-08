import { getInteresados, getClientes, getVehicles } from '@/lib/kapso'
import { getSeguimientos } from '@/lib/seguimientos'
import { backendHabilitado } from '@/lib/backend'
import SeguimientosClient from './SeguimientosClient'

/**
 * Seguimientos: cada charla abierta con un interesado o un cliente, con su
 * resumen y su próximo paso. Reemplaza a las tareas tipo `seguimiento` que el
 * Tablero escondía porque eran cientos.
 *
 * `seguimientos === null` ⇒ la tabla no existe en esta instancia (modo Kapso):
 * el cliente muestra el aviso en vez de una lista vacía.
 */
export default async function SeguimientosPage() {
  const [seguimientos, interesados, clientes, vehicles] = await Promise.all([
    getSeguimientos(), getInteresados(), getClientes(), getVehicles(),
  ])
  return (
    <SeguimientosClient
      seguimientos={seguimientos}
      interesados={interesados}
      clientes={clientes}
      vehicles={vehicles}
      ia={backendHabilitado()}
    />
  )
}
