import { getClientes, getInteresados } from '@/lib/kapso'
import ClientesClient from './ClientesClient'
import { SectionNav, CLIENTES_NAV } from '@/components/section-nav'
import { backendHabilitado } from '@/lib/backend'

export default async function Clientes() {
  const [clientes, interesados] = await Promise.all([getClientes(), getInteresados()])
  return (
    <>
      <SectionNav items={CLIENTES_NAV} />
      <ClientesClient clientes={clientes} interesados={interesados} ia={backendHabilitado()} />
    </>
  )
}
