import { getKbEntries, getEquipo, getConfigNegocio } from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import KbClient from './KbClient'

export default async function KbPage() {
  const [entries, equipoRows, config] = await Promise.all([
    getKbEntries(), getEquipo(), getConfigNegocio(),
  ])
  const equipo = equipoFromRows(equipoRows)
  return (
    <KbClient
      entries={entries}
      equipo={equipo}
      defAssignee={resolveDefaultAssignee(config, equipo)}
    />
  )
}
