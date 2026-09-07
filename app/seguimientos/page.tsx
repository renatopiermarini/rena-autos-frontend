import { MessagesSquareIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

/**
 * Seguimientos: cada charla abierta con un interesado o un cliente, con su
 * resumen y su próximo paso. Reemplaza a las tareas tipo `seguimiento` que el
 * Tablero escondía porque eran cientos.
 *
 * La pantalla llega en la fase 5 del plan de IA distribuida (tabla
 * `seguimientos` en Postgres + jobs del CRM). El ítem del nav ya está para
 * que el orden nuevo se vea completo; hasta entonces, esto es el placeholder.
 */
export default function SeguimientosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Seguimientos</h1>
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={MessagesSquareIcon}
          title="Próximamente"
          hint="Acá van a vivir los seguimientos: cada charla abierta con su resumen y su próximo paso. Por ahora siguen en Tareas."
        />
      </div>
    </div>
  )
}
