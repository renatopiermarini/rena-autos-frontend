import { getKbEntries, getEquipo, getConfigNegocio } from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import { plantillasDe } from '@/lib/mensajes'
import MensajesClient from './MensajesClient'

export default async function MensajesPage() {
  const [rows, equipoRows, config] = await Promise.all([
    getKbEntries(), getEquipo(), getConfigNegocio(),
  ])

  const equipo = equipoFromRows(equipoRows)
  return (
    <MensajesClient
      plantillas={plantillasDe(rows)}
      autor={resolveDefaultAssignee(config, equipo)}
    />
  )
}
