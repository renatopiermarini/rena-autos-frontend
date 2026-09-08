import { FileSignatureIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { backendHabilitado } from '@/lib/backend'
import { getClientes, getDocumentosMeta, getVehicles } from '@/lib/kapso'
import DocumentosClient from './DocumentosClient'

/**
 * Documentos: generar los contratos (recibo de seña, recibo de pago, mandato,
 * boleto) eligiendo plantilla, auto, cliente y campos; con el panel de
 * faltantes en vivo (POST /api/documentos/preparar) y el historial de lo
 * generado (documentos_meta con origen 'generado').
 *
 * Todo el trabajo lo hace el backend del bot (rena-autos-api api/documentos.py)
 * por los proxies de app/api/documentos/*. Sin BACKEND_URL/BACKEND_API_KEY la
 * pantalla lo dice y no dibuja el wizard: mejor que no exista a que exista y
 * falle. Se decide ACÁ, en el server component, porque la key no cruza al
 * browser (lib/backend.ts).
 */
export default async function DocumentosPage() {
  if (!backendHabilitado()) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={FileSignatureIcon}
            title="Esta instancia no tiene backend"
            hint="Los contratos los arma el backend del bot (BACKEND_URL / BACKEND_API_KEY). Sin él no hay nada que generar acá."
          />
        </div>
      </div>
    )
  }

  const [vehicles, clientes, documentos] = await Promise.all([
    getVehicles(),
    getClientes(),
    // El historial: vista documentos_meta (sin bytes). Sin Postgres → [].
    getDocumentosMeta(),
  ])
  return <DocumentosClient vehicles={vehicles} clientes={clientes} documentos={documentos} />
}
