import { getInteresados, getVehicles, getOfertas } from '@/lib/kapso'
import InteresadosClient from './InteresadosClient'
import { SectionNav, CLIENTES_NAV } from '@/components/section-nav'

export default async function Interesados() {
  const [interesados, vehicles, ofertas] = await Promise.all([
    getInteresados(), getVehicles(), getOfertas(),
  ])
  return (
    <>
      <SectionNav items={CLIENTES_NAV} />
      <InteresadosClient interesados={interesados} vehicles={vehicles} ofertas={ofertas} />
    </>
  )
}
