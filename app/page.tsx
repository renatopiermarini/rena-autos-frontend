import {
  getTareas, getVehicles, getPrestamos, getVisitas,
  getInteresados, getMovimientos, getClientes, getCuentas, getEquipo, getConfigNegocio,
  cuentasInfo, umbralAlertaCaja, capFirst, computePatrimonio,
} from '@/lib/kapso'
import { destacadosClaves, equipoFromRows, resolveDefaultAssignee, seccionesEquipo, miembroPorClave } from '@/lib/equipo'
import { diasEnStock, DIAS_STOCK_ALERTA } from '@/lib/stock'
import TableroClient from './TableroClient'
import { parseInstant, localDayKey } from '@/lib/date'
import type { BoardItem } from '@/components/calendar/MonthBoard'

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default async function Tablero() {
  const [
    tareas, vehicles, prestamos, visitas, interesados, movimientos, clientes,
    cuentasRows, equipoRows, config,
  ] = await Promise.all([
    getTareas(), getVehicles(), getPrestamos(), getVisitas(), getInteresados(),
    getMovimientos(), getClientes(),
    getCuentas(), getEquipo(), getConfigNegocio(),
  ])

  // Perfil de la instancia. Sin las tablas de config esto es exactamente lo que
  // el tablero tenía escrito a mano: cuentas cash/nexo/fiwind, asignado por
  // defecto rena, y una sola sección destacada (Marshiot).
  const cuentas = cuentasInfo(cuentasRows)

  // "¿Cómo vengo?" — la pregunta con la que se abre el dashboard, que hasta ahora
  // el tablero no contestaba (arrancaba con datos faltantes y el calendario).
  // TODA la matemática sale de computePatrimonio, el MISMO helper que dibuja
  // /finanzas: no hay una segunda cuenta que se pueda desincronizar. Por eso
  // también el saldo de la alerta de caja pasó a ser el DERIVADO del ledger y ya
  // no la fila cacheada de `balances`, que es la que hacía que el tablero y
  // Finanzas mostraran dos números distintos para la misma caja.
  const patrimonio = computePatrimonio(
    movimientos, vehicles, prestamos, clientes, undefined, cuentas.map(c => c.clave),
  )

  const equipo = equipoFromRows(equipoRows)
  const defAssignee = resolveDefaultAssignee(config, equipo)
  const destacados = seccionesEquipo(equipo, defAssignee, destacadosClaves(config, equipo, defAssignee))

  const vehLabel = (id: any) => {
    const v = vehicles.find((x: any) => x.id === id)
    return v ? (`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || `Auto #${id}`) : '—'
  }
  const interLabel = (id: any) => interesados.find((x: any) => x.id === id)?.nombre ?? ''

  const items: BoardItem[] = []

  for (const v of visitas) {
    if (!v.fecha || (v.resultado && v.resultado !== 'pendiente')) continue
    const d = parseInstant(v.fecha)
    if (!d) continue
    items.push({
      id: v.id,
      kind: 'visita',
      hora: hhmm(d),
      // Person first: nobody here thinks in vehicles-at-times.
      title: interLabel(v.interesado_id) || vehLabel(v.vehicle_id),
      subtitle: interLabel(v.interesado_id) ? vehLabel(v.vehicle_id) : undefined,
      href: `/visitas?id=${v.id}`,
      dayKey: localDayKey(d),
    })
  }

  // Seguimientos are the bot's CRM follow-ups. There are hundreds of them and they
  // drowned the tablero — on one day they were 38 of 38 items. They stay in /tareas
  // and the agent still messages about them; this screen is for what a human has to
  // look at. `tipo` is the real field, the title check catches rows the bot wrote
  // before it started setting it.
  const esSeguimiento = (t: any) =>
    String(t?.tipo ?? '').toLowerCase() === 'seguimiento' ||
    /^\s*seguimiento\b/i.test(String(t?.titulo ?? ''))

  // Las tareas de los miembros destacados (asignables que NO son el asignado por
  // defecto — con el perfil de Renato, Marshiot) van en su propia sección arriba
  // del tablero; las que tienen fecha igual quedan en el calendario, pero no
  // repetidas en "Sin fecha".
  type TareaDestacada = { id: number; titulo: string; urgent: boolean; fecha: string | null }
  const porMiembro = new Map<string, TareaDestacada[]>(destacados.map(m => [m.clave, []]))

  const sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[] = []
  for (const t of tareas) {
    if (t.estado === 'completada') continue
    if (esSeguimiento(t)) continue
    const urgent = t.prioridad === 'alta'
    // `fecha_vencimiento` is a DATE column. Slice it rather than parsing, so a
    // date-only value never gets pulled a day backwards through UTC.
    const rawFecha = t.fecha_vencimiento ? String(t.fecha_vencimiento).slice(0, 10) : null
    const raw = rawFecha && /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : null
    const destacado = miembroPorClave(destacados, t.asignado)
    if (destacado) {
      porMiembro.get(destacado.clave)!.push({ id: t.id, titulo: t.titulo || 'Sin título', urgent, fecha: raw })
    }
    if (!raw) {
      if (!destacado) {
        sinFecha.push({ id: t.id, titulo: t.titulo || 'Sin título', asignado: t.asignado, urgent })
      }
      continue
    }
    items.push({
      id: t.id,
      kind: 'tarea',
      hora: null,
      title: t.titulo || 'Sin título',
      subtitle: t.asignado || undefined,
      done: false,
      urgent,
      dayKey: raw,
    })
  }
  sinFecha.sort((a, b) => Number(b.urgent) - Number(a.urgent))
  // Urgentes primero, después por fecha; las sin fecha al final.
  const secciones = destacados
    .map(m => ({
      clave: m.clave,
      label: m.label,
      badgeCls: m.badge,
      tareas: porMiembro.get(m.clave)!.sort((a, b) =>
        Number(b.urgent) - Number(a.urgent) || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')),
    }))
    .filter(s => s.tareas.length > 0)

  const hoy = new Date()
  const alertas: string[] = []
  // La caja principal del perfil (la primera por `orden`) y su umbral. Sin las
  // tablas de config: cash y 500, la alerta de siempre.
  const cajaPrincipal = cuentas[0]
  const umbral = umbralAlertaCaja(config)
  const saldoPrincipal = patrimonio.cajas[cajaPrincipal.clave] ?? 0
  if (saldoPrincipal < umbral) {
    alertas.push(`${capFirst(cajaPrincipal.label)} bajo: $${saldoPrincipal.toLocaleString('es-AR')}`)
  }
  prestamos.filter((p: any) => p.estado === 'activo').forEach((p: any) => {
    if (!p.fecha_vencimiento) return
    const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000)
    if (dias < 0) alertas.push(`Préstamo vencido hace ${Math.abs(dias)} días`)
    else if (dias <= 30) alertas.push(`Préstamo vence en ${dias} días`)
  })

  // Autos en circulación con datos faltantes — banner permanente del Tablero
  // (reemplaza al aviso diario por WhatsApp, pedido del usuario 2026-08-10).
  // Misma regla que check_vehicles_incomplete del backend: a_ingresar tiene
  // campos mínimos permitidos a propósito; vendido ya está cerrado.
  const CAMPOS_AUTO: [string, string][] = [
    ['dominio', 'patente'], ['numero_motor', 'n° motor'], ['numero_chasis', 'n° chasis'],
    ['color', 'color'], ['km', 'km'], ['precio_publicado', 'precio publicado'],
  ]
  const datosFaltantes = vehicles
    .filter((v: any) => v.estado !== 'vendido' && v.estado !== 'a_ingresar')
    .map((v: any) => {
      // Días en stock: si el auto ya lleva demasiado parado, el dato que falta
      // deja de ser higiene y pasa a ser urgente. Va como chip en la misma fila
      // en vez de abrir otra sección.
      const dias = diasEnStock(v.fecha_ingreso)
      return {
        label: `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() + (v.dominio ? ` (${v.dominio})` : ''),
        faltan: CAMPOS_AUTO.filter(([campo]) => !v[campo]).map(([, nombre]) => nombre),
        dias: dias !== null && dias > DIAS_STOCK_ALERTA ? dias : null,
      }
    })
    .filter((v: { faltan: string[] }) => v.faltan.length > 0)

  // Los cuatro números de arriba. `sub` es la letra chica; `href` la pantalla
  // donde se sigue mirando. Todo derivado del ledger — nada cargado a mano.
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  const resumen = [
    {
      label: 'En caja',
      valor: money(patrimonio.cajas.total),
      sub: cuentas.map(c => `${c.label} ${money(patrimonio.cajas[c.clave] ?? 0)}`).join(' · '),
      href: '/finanzas',
    },
    {
      label: 'Invertido en stock',
      valor: money(patrimonio.stock.costo_invertido),
      sub: `${patrimonio.stock.autos.length} auto${patrimonio.stock.autos.length === 1 ? '' : 's'} propios sin vender`,
      href: '/stock',
    },
    {
      label: 'Ganancia esperada',
      valor: (patrimonio.stock.ganancia_esperada >= 0 ? '+' : '−') + money(Math.abs(patrimonio.stock.ganancia_esperada)),
      sub: 'si se venden al precio previsto',
      href: '/finanzas',
      tone: patrimonio.stock.ganancia_esperada >= 0 ? 'positive' as const : 'negative' as const,
    },
    {
      label: 'Deudas',
      valor: money(patrimonio.deuda_total),
      sub: patrimonio.interes_mensual_total > 0
        ? `interés ${money(patrimonio.interes_mensual_total)}/mes`
        : 'sin interés mensual',
      href: '/finanzas',
      tone: patrimonio.deuda_total > 0 ? 'negative' as const : 'default' as const,
    },
  ]

  return (
    <TableroClient
      items={items}
      alertas={alertas}
      sinFecha={sinFecha}
      datosFaltantes={datosFaltantes}
      secciones={secciones}
      resumen={resumen}
    />
  )
}
