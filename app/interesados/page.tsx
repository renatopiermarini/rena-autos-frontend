import { getInteresados, getVehicles, getOfertas } from '@/lib/kapso'
import { getSeguimientos } from '@/lib/seguimientos'
import InteresadosClient from './InteresadosClient'
import { SectionNav, CLIENTES_NAV } from '@/components/section-nav'
import { backendHabilitado } from '@/lib/backend'

export default async function Interesados() {
  // `seguimientos` es null en modo Kapso (la tabla no existe): el alta cae a
  // "Agregar a notas" y la ficha no lista pendientes.
  const [interesados, vehicles, ofertas, seguimientos] = await Promise.all([
    getInteresados(), getVehicles(), getOfertas(), getSeguimientos(),
  ])
  return (
    <>
      <SectionNav items={CLIENTES_NAV} />
      <InteresadosClient interesados={interesados} vehicles={vehicles} ofertas={ofertas} seguimientos={seguimientos} ia={backendHabilitado()} />
    </>
  )
}
