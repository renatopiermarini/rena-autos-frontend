import { getEquipoRows } from '@/lib/kapso'
import { SectionNav, CONFIG_NAV } from '@/components/section-nav'
import EquipoClient from './EquipoClient'

export default async function ConfigEquipo() {
  const equipo = await getEquipoRows()
  return (
    <>
      <SectionNav items={CONFIG_NAV} label="Secciones de configuración" />
      <EquipoClient equipo={equipo} />
    </>
  )
}
