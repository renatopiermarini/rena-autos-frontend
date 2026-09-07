import { FileSignatureIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

/**
 * Documentos: generar los contratos (recibo de seña, recibo de pago, mandato,
 * boleto) eligiendo auto, cliente y campos, y guardarlos en la documentación
 * del auto.
 *
 * La pantalla llega en la fase 4 del plan de IA distribuida (tabla
 * `documentos` en Postgres); hasta entonces los contratos se siguen generando
 * desde la ficha del auto en Stock. El ítem del nav ya está para que el orden
 * nuevo se vea completo.
 */
export default function DocumentosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={FileSignatureIcon}
          title="Próximamente"
          hint="Acá se van a generar los contratos (seña, pago, mandato, boleto). Por ahora, desde el botón Documento en la ficha del auto."
        />
      </div>
    </div>
  )
}
