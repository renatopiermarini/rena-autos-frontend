import { getConfigNegocioRows } from '@/lib/kapso'
import { SectionNav, CONFIG_NAV } from '@/components/section-nav'
import NegocioClient from './NegocioClient'

// Se pasan las filas CRUDAS (no el record) porque el guardado necesita el id de
// cada clave: PATCH si la fila existe, POST si es la primera vez.
export default async function ConfigNegocio() {
  const rows = await getConfigNegocioRows()
  return (
    <>
      <SectionNav items={CONFIG_NAV} label="Secciones de configuración" />
      <NegocioClient rows={rows} />
    </>
  )
}
