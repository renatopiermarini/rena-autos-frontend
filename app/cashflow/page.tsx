import type { Metadata } from 'next'
import {
  getMovimientos, getPrestamos, getClientes, getVehicles, getCuentas, cuentaKeys, getAuditVehiculos,
  getConfigNegocio,
} from '@/lib/kapso'
import { brandingFrom } from '@/lib/branding'
import { buildCashflowReport, parseGastosFijos } from '@/lib/cashflow'
import CashflowClient from './CashflowClient'

export const metadata: Metadata = { title: 'Cashflow y finanzas' }

// Tablero aparte (sin el nav del dashboard): la plata del negocio en una sola
// pantalla. Todo se calcula acá, en el server, y al cliente baja sólo el
// reporte — la reconstrucción del capital día por día corre computePatrimonio
// ~200 veces y no tiene por qué hacerlo el browser.
export default async function Cashflow({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const uno = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const [movimientos, prestamos, clientes, vehicles, cuentasRows, auditVehiculos, config] = await Promise.all([
    getMovimientos(), getPrestamos(), getClientes(), getVehicles(), getCuentas(), getAuditVehiculos(),
    getConfigNegocio(),
  ])
  const report = buildCashflowReport({
    movimientos, vehicles, prestamos, clientes, cuentas: cuentaKeys(cuentasRows), auditVehiculos,
    // Qué es gasto fijo: retiros + Fran + Marshiot + cocheras, salvo que
    // config_negocio.gastos_fijos diga otra cosa.
    gastosFijos: parseGastosFijos(config.gastos_fijos),
  })
  // ?tab=anual&p=2026 → cada vista tiene su link, para mandarlo por WhatsApp.
  return (
    <CashflowClient
      report={report} tabInicial={uno(sp.tab)} periodoInicial={uno(sp.p)}
      titulo={brandingFrom(config).titulo}
    />
  )
}
