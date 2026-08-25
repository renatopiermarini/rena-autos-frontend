import { getClientes, getPrestamos } from '@/lib/kapso'
import { SectionNav, CONFIG_NAV } from '@/components/section-nav'
import InversoresClient from './InversoresClient'

// Los inversores NO son una tabla nueva: son `clientes` marcados como acreedor.
// La pantalla de Clientes ya los reconoce por es_acreedor (badge) y por tipo
// (select), así que acá se toma la unión de los dos y el alta setea ambos.
export default async function ConfigInversores() {
  const [clientes, prestamos] = await Promise.all([getClientes(), getPrestamos()])
  return (
    <>
      <SectionNav items={CONFIG_NAV} label="Secciones de configuración" />
      <InversoresClient clientes={clientes} prestamos={prestamos} />
    </>
  )
}
