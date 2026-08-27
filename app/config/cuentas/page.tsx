import { getCuentasRows, getMovimientos } from '@/lib/kapso'
import { SectionNav, CONFIG_NAV } from '@/components/section-nav'
import CuentasClient from './CuentasClient'

// Se piden las filas CRUDAS (activas e inactivas): la baja es lógica, así que
// una cuenta desactivada tiene que seguir viéndose para poder reactivarla.
//
// Los movimientos son para el saldo DERIVADO por cuenta (no hay columna de
// saldo que leer: el saldo se calcula del ledger, ver saldoDeCuenta). Sin ellos
// "Ajustar saldo" no sabría contra qué comparar el saldo real que tipea el
// usuario.
export default async function ConfigCuentas() {
  const [cuentas, movimientos] = await Promise.all([getCuentasRows(), getMovimientos()])
  return (
    <>
      <SectionNav items={CONFIG_NAV} label="Secciones de configuración" />
      <CuentasClient cuentas={cuentas} movimientos={movimientos} />
    </>
  )
}
