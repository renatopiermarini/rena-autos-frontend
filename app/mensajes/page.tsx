import { redirect } from 'next/navigation'
import { getKbEntries, getEquipo, getConfigNegocio } from '@/lib/kapso'
import { equipoFromRows, resolveDefaultAssignee } from '@/lib/equipo'
import { mensajesHabilitados, plantillasDe } from '@/lib/mensajes'
import MensajesClient from './MensajesClient'

export default async function MensajesPage() {
  const [rows, equipoRows, config] = await Promise.all([
    getKbEntries(), getEquipo(), getConfigNegocio(),
  ])

  // La pantalla es de la instancia de Renato. En una instancia con la config
  // cargada y sin `mensajes_frecuentes=1` no existe: el ítem del nav tampoco
  // está, así que llegar acá es escribir la URL a mano o traer un bookmark
  // viejo. Se redirige al tablero en vez de tirar un 404 pelado — la misma
  // regla que aplica MainNav, con el helper compartido.
  if (!mensajesHabilitados(config)) redirect('/')

  const equipo = equipoFromRows(equipoRows)
  return (
    <MensajesClient
      plantillas={plantillasDe(rows)}
      autor={resolveDefaultAssignee(config, equipo)}
    />
  )
}
