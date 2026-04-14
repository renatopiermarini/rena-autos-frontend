export const dynamic = 'force-dynamic'
import { getClientes, getInteresados } from '@/lib/kapso'
import ClientesClient from './ClientesClient'

export default async function Clientes() {
  const [clientes, interesados] = await Promise.all([getClientes(), getInteresados()])
  return <ClientesClient clientes={clientes} interesados={interesados} />
}
