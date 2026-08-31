'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { patchRecordDetailed } from '@/lib/kapso'
import { estadoMeta } from '@/lib/estados'
import { fmtDMY } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon, FileCheck2Icon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

// Espejo de tools/documentacion_tools.py ITEMS (columnas doc_* de vehicles) y
// de DOC_ITEMS en app/stock/StockClient.tsx. Cambiar allá y acá.
const DOC_ITEMS: { key: string; label: string }[] = [
  { key: 'doc_formulario_08', label: 'Formulario 08 firmado y certificado' },
  { key: 'doc_cedulas', label: 'Cédulas titular y autorizados' },
  { key: 'doc_titulo', label: 'Título automotor' },
  { key: 'doc_informe_dominio', label: 'Informe de dominio' },
  { key: 'doc_verificacion_policial', label: 'Verificación policial' },
  { key: 'doc_libre_deudas', label: 'Libre de deudas y patentes' },
]
const docOk = (v: any, key: string) => Number(v?.[key] ?? 0) === 1
const docCount = (v: any) => DOC_ITEMS.filter(d => docOk(v, d.key)).length

// Vocabulario de la tabla `tramites` (tools/tramites_tools.py escribe libre).
const TRAMITE_LABEL: Record<string, string> = {
  transferencia: 'Transferencia',
  patentamiento: 'Patentamiento 0km',
  informe_dominio: 'Informe de dominio',
  libre_deuda: 'Libre deuda / SUATS',
  verificacion_policial: 'Verificación policial',
  cedula: 'Cédula',
}
const TRAMITE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'secondary'> = {
  completado: 'success',
  en_curso: 'info',
  pendiente: 'warning',
}

// "DD/MM HH:MM" desde el ISO naive de la DB, por slicing: determinístico en
// server y browser (toLocaleString varía entre ICUs y rompe la hidratación).
function fmtTurno(iso?: string | null): string {
  if (!iso || iso.length < 16 || iso[10] !== 'T') return (iso ?? '').slice(0, 10)
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`
}

function autoLabel(v: any): string {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''}`.trim()
  return v.dominio ? `${base} · ${v.dominio}` : base || `#${v.id}`
}

function FilaAuto({ v, onDone }: { v: any; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const n = docCount(v)
  const completo = n === DOC_ITEMS.length

  async function toggle(key: string) {
    if (saving) return
    setSaving(true)
    const next = docOk(v, key) ? 0 : 1
    const { ok, error } = await patchRecordDetailed('vehicles', v.id, { [key]: next })
    setSaving(false)
    if (ok) { toast.success(next ? 'Papel tildado' : 'Papel destildado'); onDone() }
    else toast.error(error || 'Error al guardar.')
  }

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {open ? <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
              : <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="font-medium">{autoLabel(v)}</span>
        <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
        <span className="ml-auto flex items-center gap-2">
          {completo && <FileCheck2Icon className="size-4 text-success" />}
          <span className={completo ? 'text-success text-sm font-medium' : 'text-sm text-muted-foreground'}>
            Papeles · {n}/{DOC_ITEMS.length}
          </span>
        </span>
      </button>
      {open && (
        <div className="px-10 pb-3 space-y-1.5">
          {DOC_ITEMS.map(d => (
            <label key={d.key} className="flex items-center gap-2 py-1 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={docOk(v, d.key)}
                onChange={() => toggle(d.key)}
                disabled={saving}
                className="size-4 accent-primary"
              />
              <span className={docOk(v, d.key) ? '' : 'text-muted-foreground'}>{d.label}</span>
            </label>
          ))}
          {v.drive_url ? (
            <a href={v.drive_url} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-sm text-primary hover:underline pt-1">
              Abrir carpeta de Drive <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground pt-1">Sin carpeta de Drive — se crea desde el chat.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocumentacionClient({
  vehicles, tramites, turnos,
}: {
  vehicles: any[]; tramites: any[]; turnos: any[]
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  const activos = useMemo(
    () => vehicles.filter((v: any) => v.estado !== 'vendido')
      .sort((a: any, b: any) => docCount(a) - docCount(b)),
    [vehicles],
  )
  const vendidos = useMemo(() => vehicles.filter((v: any) => v.estado === 'vendido'), [vehicles])
  const enCurso = tramites.filter((t: any) => t.estado !== 'completado')
  const completados = tramites.filter((t: any) => t.estado === 'completado')
  const turnosPend = turnos
    .filter((t: any) => (t.estado ?? 'pendiente') === 'pendiente')
    .sort((a: any, b: any) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')))
  const completos = activos.filter((v: any) => docCount(v) === DOC_ITEMS.length).length

  // Claves numéricas: en modo Kapso/D1 las FK pueden venir como string y un
  // Map por identidad no matchearía (mismo incidente que el lookup del 130i).
  const vehIndex = useMemo(() => new Map(vehicles.map((v: any) => [Number(v.id), v])), [vehicles])
  const tramiteAuto = (t: any) => {
    const v = t.vehicle_id != null ? vehIndex.get(Number(t.vehicle_id)) : null
    return v ? autoLabel(v) : (t.dominio || '')
  }
  const tramiteTitulo = (t: any) => {
    const base = TRAMITE_LABEL[t.tipo] ?? t.tipo
    const auto = tramiteAuto(t)
    return auto ? `${base} — ${auto}` : base
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Documentación</h1>
        <span className="text-sm text-muted-foreground">
          {completos}/{activos.length} legajos completos · {enCurso.length} trámite{enCurso.length === 1 ? '' : 's'} en curso
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Papeles por auto</h2>
        <Card>
          <CardContent className="p-0">
            {activos.length === 0
              ? <EmptyState title="Sin autos activos" />
              : activos.map((v: any) => <FilaAuto key={v.id} v={v} onDone={refresh} />)}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trámites en curso</h2>
        <Card>
          <CardContent className="p-0">
            {enCurso.length === 0
              ? <EmptyState title="Nada en curso" />
              : enCurso.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 border-b last:border-b-0">
                  <Badge variant={TRAMITE_VARIANT[t.estado] ?? 'secondary'}>
                    {t.estado === 'en_curso' ? 'En curso' : t.estado === 'pendiente' ? 'Pendiente' : t.estado}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{tramiteTitulo(t)}</p>
                    {t.notas && <p className="max-w-prose text-sm text-muted-foreground">{t.notas}</p>}
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtDMY(t.updated_at)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Turnos (registro / planta verificadora)</h2>
        <Card>
          <CardContent className="p-0">
            {turnosPend.length === 0
              ? <EmptyState title="Sin turnos pendientes" />
              : turnosPend.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 border-b last:border-b-0">
                  <span className="shrink-0 text-sm font-medium tabular-nums">{fmtTurno(t.fecha)}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {t.tipo === 'verificacion_policial' ? 'Verificación policial' : t.tipo === 'transferencia' ? 'Transferencia' : (t.tipo ?? 'Turno')}
                      {t.vehicle_id != null && vehIndex.get(Number(t.vehicle_id)) ? ` — ${autoLabel(vehIndex.get(Number(t.vehicle_id)))}` : ''}
                    </p>
                    {(t.direccion || t.notas) && (
                      <p className="max-w-prose text-sm text-muted-foreground">{[t.direccion, t.notas].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </section>

      {(completados.length > 0 || vendidos.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cerrados</h2>
          <Card>
            <CardContent className="p-0">
              {completados.map((t: any) => (
                <div key={`t${t.id}`} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 text-sm">
                  <Badge variant="success">Completado</Badge>
                  <span>{tramiteTitulo(t)}</span>
                  {t.resultado && <span className="text-muted-foreground">({t.resultado})</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDMY(t.updated_at)}</span>
                </div>
              ))}
              {vendidos.map((v: any) => (
                <div key={`v${v.id}`} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 text-sm">
                  <Badge variant="secondary">Vendido</Badge>
                  <span>{autoLabel(v)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Papeles {docCount(v)}/{DOC_ITEMS.length}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        El checklist también se ve auto por auto en <Link href="/stock" className="text-primary hover:underline">Stock</Link>,
        y el asistente del <Link href="/chat" className="text-primary hover:underline">Chat</Link> puede tildar papeles,
        crear la carpeta de Drive y subir fotos de los papeles por WhatsApp.
      </p>
    </div>
  )
}
