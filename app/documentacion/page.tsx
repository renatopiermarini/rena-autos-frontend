import { getVehicles, getTramites, getTurnos, getDocumentosMeta } from '@/lib/kapso'
import { backendHabilitado } from '@/lib/backend'
import DocumentacionClient from './DocumentacionClient'

export default async function Documentacion() {
  const [vehicles, tramites, turnos, documentos] = await Promise.all([
    getVehicles(),
    getTramites(),
    getTurnos(),
    // Archivos por auto (vista documentos_meta, sin bytes). En Kapso no existe → [].
    getDocumentosMeta(),
  ])
  return (
    <DocumentacionClient
      vehicles={vehicles}
      tramites={tramites}
      turnos={turnos}
      documentos={documentos}
      // Subir un papel pega al backend del bot (proxy app/api/documentos/subir):
      // sin las dos env el dropzone no se dibuja. Se lee ACÁ porque
      // BACKEND_API_KEY no cruza al browser (lib/backend.ts).
      backend={backendHabilitado()}
    />
  )
}
