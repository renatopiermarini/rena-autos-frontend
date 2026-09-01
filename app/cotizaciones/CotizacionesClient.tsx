'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecordDetailed } from '@/lib/kapso'
import { fmtDMY as fmtFecha } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { CheckIcon, HandCoinsIcon, XIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { money } from '@/lib/money'

// Ciclo de una cotización (lo escribe el bot hasta `pendiente`; acá se cierra):
//   esperando  → le mandamos el auto al colega, todavía no respondió
//   pendiente  → el colega respondió el precio; falta pasárselo al cliente final
//   enviada    → ya se le pasó el precio al cliente
//   descartada → falso positivo o cotización que no siguió
const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'> = {
  esperando:  'secondary',
  pendiente:  'warning',
  enviada:    'success',
  descartada: 'outline',
}

type Filtro = 'pendientes' | 'esperando' | 'cerradas'

function CotizacionRow({ c, onDone }: { c: any; onDone: () => void }) {
  const [saving, setSaving] = useState(false)

  async function cambiarEstado(estado: 'enviada' | 'descartada') {
    if (saving) return                        // double-click = duplicate PATCH
    setSaving(true)
    const patch: Record<string, any> = { estado }
    if (estado === 'enviada') patch.enviada_at = new Date().toISOString()
    const { ok, error } = await patchRecordDetailed('cotizaciones', c.id, patch)
    setSaving(false)
    if (ok) { toast.success(estado === 'enviada' ? 'Marcada como enviada' : 'Cotización descartada'); onDone() }
    else toast.error(error || 'Error al cambiar estado.')
  }

  const precio = c.precio_usd != null ? Number(c.precio_usd) : null
  const abierta = c.estado === 'esperando' || c.estado === 'pendiente'

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2">
        <span className="font-medium">{c.vehiculo || '—'}</span>
        {c.pedido_texto && c.pedido_texto !== c.vehiculo && (
          <div className="text-xs text-muted-foreground max-w-md truncate">“{c.pedido_texto}”</div>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground text-xs font-mono tabular-nums">
        {fmtFecha(c.pedido_at) || '—'}
      </td>
      <td className="px-3 py-2 text-muted-foreground max-w-md truncate">
        {c.respuesta_texto ? `“${c.respuesta_texto}”` : '—'}
        {c.respuesta_at && (
          <span className="ml-1.5 text-xs font-mono tabular-nums">{fmtFecha(c.respuesta_at)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{money(precio)}</td>
      <td className="px-3 py-2">
        <Badge variant={ESTADO_VARIANT[c.estado] ?? 'outline'}>{c.estado}</Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {c.estado === 'pendiente' && (
            <Button size="xs" onClick={() => cambiarEstado('enviada')} disabled={saving}>
              <CheckIcon className="size-3.5" /> Enviada
            </Button>
          )}
          {abierta && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => cambiarEstado('descartada')}
              disabled={saving}
              title="Descartar cotización"
              aria-label="Descartar cotización"
              className="text-muted-foreground hover:text-destructive"
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function CotizacionesClient({ cotizaciones }: { cotizaciones: any[] }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('pendientes')

  const refresh = () => router.refresh()

  const pendientes = cotizaciones.filter(c => c.estado === 'pendiente')
  const esperando = cotizaciones.filter(c => c.estado === 'esperando')
  const cerradas = cotizaciones.filter(c => c.estado === 'enviada' || c.estado === 'descartada')

  const mostrar = (filtro === 'pendientes' ? pendientes : filtro === 'esperando' ? esperando : cerradas)
    .slice()
    // Lo más reciente arriba: la respuesta del colega si la hay, si no el pedido.
    .sort((a, b) => String(b.respuesta_at ?? b.pedido_at ?? '').localeCompare(String(a.respuesta_at ?? a.pedido_at ?? '')))

  const EMPTY: Record<Filtro, string> = {
    pendientes: 'Sin cotizaciones por enviar',
    esperando: 'Sin pedidos esperando al colega',
    cerradas: 'Sin cotizaciones cerradas',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <span className="text-sm text-muted-foreground">
            {pendientes.length} por enviar · {esperando.length} esperando al colega
          </span>
        </div>
        <Tabs value={filtro} onValueChange={(v: any) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
            <TabsTrigger value="esperando">Esperando colega</TabsTrigger>
            <TabsTrigger value="cerradas">Cerradas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Auto</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Pedido</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Respuesta</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">Precio</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Estado</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mostrar.map(c => (
                  <CotizacionRow key={c.id} c={c} onDone={refresh} />
                ))}
                {mostrar.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={HandCoinsIcon}
                        title={EMPTY[filtro]}
                        hint="El bot detecta solo los idas y vueltas con el colega cotizador."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
