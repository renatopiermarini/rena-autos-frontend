import {
  getVehicles, getTareas, getClientes, getMovimientos, getPrestamos,
  getEquipo, getConfigNegocio, getVerificaciones, getDocumentosMeta,
} from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import { comisionConsignacionPct } from '@/lib/venta'
import StockClient from './StockClient'
import { backendHabilitado } from '@/lib/backend'

export default async function Stock() {
  // Ni el alta ni la venta tocan la caja (Finanzas es solo consulta), así que
  // esta página ya no necesita la tabla `cuentas`.
  const [vehicles, tareas, clientes, movimientos, prestamos, equipoRows, config, verificaciones, documentos] =
    await Promise.all([
      getVehicles(), getTareas(), getClientes(), getMovimientos(), getPrestamos(),
      getEquipo(), getConfigNegocio(), getVerificaciones(),
      // Archivos por auto (vista documentos_meta, sin bytes). En Kapso no existe → [].
      getDocumentosMeta(),
    ])
  // El detalle de un auto solo consume movimientos ligados a un vehículo
  // (computeVehicleFinancials) o a un préstamo (computeLoanPosition). Serializar
  // el ledger ENTERO al browser en cada carga era el mayor peso de esta página.
  const movimientosVinculados = movimientos.filter(
    (m: any) => m.vehicle_id != null || m.prestamo_id != null,
  )
  return (
    <StockClient
      vehicles={vehicles}
      verificaciones={verificaciones}
      tareas={tareas}
      clientes={clientes}
      movimientos={movimientosVinculados}
      prestamos={prestamos}
      defAssignee={resolveDefaultAssignee(config, equipoFromRows(equipoRows))}
      comisionPct={comisionConsignacionPct(config)}
      documentos={documentos}
      // Los archivos y los contratos viven en el backend del bot (proxies
      // app/api/documentos/*, header X-API-Key). La instancia que no tenga las
      // dos env no dibuja ni el dropzone ni el link a /documentos: mejor que no
      // exista a que exista y falle. Se lee ACÁ, en el server component, porque
      // BACKEND_API_KEY no puede cruzar al browser (ver lib/backend.ts).
      documentosHabilitado={backendHabilitado()}
      // Mismo gate para la IA (tarjeta verde → Nuevo auto / ficha): se decide
      // acá porque backendHabilitado() lee env que no cruza al browser.
      ia={backendHabilitado()}
    />
  )
}
