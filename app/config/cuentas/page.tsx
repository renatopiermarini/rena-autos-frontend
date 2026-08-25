import { getCuentasRows } from '@/lib/kapso'
import { SectionNav, CONFIG_NAV } from '@/components/section-nav'
import CuentasClient from './CuentasClient'

// Se piden las filas CRUDAS (activas e inactivas): la baja es lógica, así que
// una cuenta desactivada tiene que seguir viéndose para poder reactivarla.
export default async function ConfigCuentas() {
  const cuentas = await getCuentasRows()
  return (
    <>
      <SectionNav items={CONFIG_NAV} label="Secciones de configuración" />
      <CuentasClient cuentas={cuentas} />
    </>
  )
}
