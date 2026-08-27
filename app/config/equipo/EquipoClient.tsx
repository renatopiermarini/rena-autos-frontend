'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flagOn, activasOrdenadas, patchRecordDetailed, postRecord, deleteRecordDetailed } from '@/lib/kapso'
import {
  ROUTES_CATALOG, ROUTE_LABEL, ROUTES_ALL, CLAVE_RE,
  isValidClave, isAllRoutes, parseRoutesCsv, routesError, routesToCsv, isRouteKey,
} from '@/lib/routes-catalog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FInput, FTextarea, FCheckbox, FField } from '@/components/form-fields'
import { ConfigMissingBanner, RestartNotice } from '@/components/config-banner'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { PlusIcon, PencilIcon, Trash2Icon, UsersIcon } from 'lucide-react'

type FormState = {
  clave: string
  display_name: string
  phone: string
  phone_env: string
  todasLasRutas: boolean
  routes: string[]
  is_assignee: boolean
  full_access: boolean
  activo: boolean
  greeting: string
  deny_message: string
}

function emptyForm(): FormState {
  return {
    clave: '', display_name: '', phone: '', phone_env: '',
    todasLasRutas: false, routes: [],
    is_assignee: true, full_access: false, activo: true, greeting: '', deny_message: '',
  }
}

function rowToForm(m: any): FormState {
  const raw = m.routes ?? ''
  return {
    clave: m.clave ?? '',
    display_name: m.display_name ?? '',
    phone: m.phone ?? '',
    phone_env: m.phone_env ?? '',
    todasLasRutas: isAllRoutes(raw),
    routes: isAllRoutes(raw) ? [] : parseRoutesCsv(raw).filter(isRouteKey),
    is_assignee: flagOn(m.is_assignee),
    full_access: flagOn(m.full_access, false),
    activo: flagOn(m.activo),
    greeting: m.greeting ?? '',
    deny_message: m.deny_message ?? '',
  }
}

function RoutesBadges({ raw }: { raw: any }) {
  if (isAllRoutes(raw)) return <Badge variant="info">todas</Badge>
  const items = parseRoutesCsv(raw)
  if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {items.map(r => (
        <Badge key={r} variant={isRouteKey(r) ? 'outline' : 'destructive'}>
          {isRouteKey(r) ? ROUTE_LABEL[r] : `${r}?`}
        </Badge>
      ))}
    </span>
  )
}

export default function EquipoClient({ equipo }: { equipo: any[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  // Con qué contenido abrió el diálogo (alta vacía o la fila que se edita):
  // contra eso se mide si hay algo sin guardar antes de cerrar.
  const [inicial, setInicial] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [borrar, setBorrar] = useState<any | null>(null)
  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange: setOpen,
  })

  const ordenados = useMemo(() => {
    const activos = activasOrdenadas(equipo, 'activo')
    const inactivos = equipo.filter(m => !flagOn(m.activo))
    return [...activos, ...inactivos]
  }, [equipo])

  function abrirAlta() {
    setEditing(null)
    setForm(emptyForm())
    setInicial(emptyForm())
    setOpen(true)
  }

  function abrirEdicion(m: any) {
    setEditing(m)
    setForm(rowToForm(m))
    setInicial(rowToForm(m))
    setOpen(true)
  }

  function toggleRoute(r: string) {
    setForm(f => ({
      ...f,
      routes: f.routes.includes(r) ? f.routes.filter(x => x !== r) : [...f.routes, r],
    }))
  }

  async function guardar() {
    if (!isValidClave(form.clave)) {
      toast.error(`Clave inválida: debe cumplir ${CLAVE_RE.source} (ej: fran).`)
      return
    }
    if (!form.display_name.trim()) {
      toast.error('El nombre para mostrar es obligatorio.')
      return
    }
    const routes = form.todasLasRutas ? ROUTES_ALL : routesToCsv(form.routes)
    // Misma validación que el proxy, para avisar antes de pegarle a la red.
    const err = routesError(routes)
    if (err) { toast.error(err); return }
    if (!form.todasLasRutas && form.routes.length === 0) {
      toast.error('Elegí al menos una ruta, o marcá "acceso total".')
      return
    }

    const payload = {
      clave: form.clave.trim(),
      display_name: form.display_name.trim(),
      phone: form.phone.trim() || null,
      phone_env: form.phone_env.trim() || null,
      routes,
      is_assignee: form.is_assignee ? 1 : 0,
      full_access: form.full_access ? 1 : 0,
      activo: form.activo ? 1 : 0,
      greeting: form.greeting.trim() || null,
      deny_message: form.deny_message.trim() || null,
    }
    setSaving(true)
    const res = editing
      ? await patchRecordDetailed('equipo', Number(editing.id), payload)
      : await postRecord('equipo', payload)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Error al guardar')
      return
    }
    toast.success(editing ? 'Integrante actualizado' : 'Integrante creado')
    setOpen(false)
    router.refresh()
  }

  async function toggleActivo(m: any) {
    const next = !flagOn(m.activo)
    const { ok, error } = await patchRecordDetailed('equipo', Number(m.id), { activo: next ? 1 : 0 })
    if (ok) {
      toast.success(next ? `"${m.clave}" activado` : `"${m.clave}" desactivado`)
      router.refresh()
    } else {
      toast.error(error || 'Error al guardar')
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return
    const { ok, error } = await deleteRecordDetailed('equipo', Number(borrar.id))
    if (ok) {
      toast.success('Integrante eliminado')
      setBorrar(null)
      router.refresh()
    } else {
      toast.error(error || 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        <Button onClick={abrirAlta}><PlusIcon /> Nuevo integrante</Button>
      </div>

      {equipo.length === 0 && <ConfigMissingBanner />}
      <RestartNotice>Los cambios en el equipo aplican al reiniciar el bot.</RestartNotice>

      <Card size="sm">
        <CardContent className="p-0">
          {ordenados.map(m => {
            const activo = flagOn(m.activo)
            return (
              <div
                key={m.id}
                className={`flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-0 ${activo ? '' : 'opacity-55'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.display_name || m.clave}</span>
                    <code className="text-xs text-muted-foreground font-mono">{m.clave}</code>
                    {flagOn(m.full_access, false) && <Badge variant="warning">acceso total</Badge>}
                    {flagOn(m.is_assignee) && <Badge variant="secondary">asignable</Badge>}
                    {!activo && <Badge variant="outline">inactivo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.phone || (m.phone_env ? <code className="font-mono">env: {m.phone_env}</code> : 'sin teléfono')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <RoutesBadges raw={m.routes} />
                  <FCheckbox
                    id={`activo-${m.id}`}
                    label="Activo"
                    checked={activo}
                    onChange={() => toggleActivo(m)}
                  />
                  <Button variant="outline" size="sm" onClick={() => abrirEdicion(m)}>
                    <PencilIcon /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBorrar(m)}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            )
          })}
          {equipo.length === 0 && (
            <EmptyState
              icon={UsersIcon}
              title="Sin equipo configurado"
              hint="El bot usa el equipo por defecto (rena, fran, marshiot) hasta que se cree la tabla."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={open} {...dialogProps}>
        <DialogContent className="sm:max-w-2xl max-h-[calc(100vh-4rem)] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar integrante' : 'Nuevo integrante'}</DialogTitle>
            <DialogDescription>
              La clave es la que guarda <code className="font-mono">tareas.asignado</code>: cambiarla
              en alguien con tareas rompe el vínculo con lo ya asignado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <FInput
                label="Clave" value={form.clave}
                onChange={v => setForm(f => ({ ...f, clave: v }))}
                placeholder="fran" hint="minúsculas, números y _"
              />
              <FInput
                label="Nombre para mostrar" value={form.display_name}
                onChange={v => setForm(f => ({ ...f, display_name: v }))}
                placeholder="Fran"
              />
              <FInput
                label="Teléfono" value={form.phone} type="tel"
                onChange={v => setForm(f => ({ ...f, phone: v }))}
                placeholder="+549..."
              />
              <FInput
                label="Variable de entorno del teléfono" value={form.phone_env}
                onChange={v => setForm(f => ({ ...f, phone_env: v }))}
                placeholder="FRAN_PHONE"
                hint="Alternativa al teléfono en claro."
              />
            </div>

            <FField label="Rutas" hint="Qué le contesta el bot a este número.">
              <div className="space-y-2">
                <FCheckbox
                  id="form-routes-all"
                  label="Acceso total (todas las rutas)"
                  checked={form.todasLasRutas}
                  onChange={v => setForm(f => ({ ...f, todasLasRutas: v }))}
                />
                {!form.todasLasRutas && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 pl-1">
                    {ROUTES_CATALOG.map(r => (
                      <FCheckbox
                        key={r}
                        id={`form-route-${r}`}
                        label={ROUTE_LABEL[r]}
                        checked={form.routes.includes(r)}
                        onChange={() => toggleRoute(r)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </FField>

            <div className="flex flex-wrap gap-6">
              <FCheckbox
                id="form-is-assignee" label="Se le pueden asignar tareas"
                checked={form.is_assignee}
                onChange={v => setForm(f => ({ ...f, is_assignee: v }))}
              />
              <FCheckbox
                id="form-full-access" label="Acceso completo (permisos de dueño)"
                checked={form.full_access}
                onChange={v => setForm(f => ({ ...f, full_access: v }))}
              />
              <FCheckbox
                id="form-activo" label="Activo"
                checked={form.activo}
                onChange={v => setForm(f => ({ ...f, activo: v }))}
              />
            </div>

            <FTextarea
              label="Saludo" value={form.greeting}
              onChange={v => setForm(f => ({ ...f, greeting: v }))}
              rows={2}
              hint="Cómo lo saluda el bot al empezar una conversación."
            />

            <FTextarea
              label="Negativa" value={form.deny_message}
              onChange={v => setForm(f => ({ ...f, deny_message: v }))}
              rows={2}
              hint="Qué responde el bot cuando pide algo fuera de sus rutas. Vacío = lista genérica de lo que sí puede."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={borrar !== null} onOpenChange={o => !o && setBorrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar a &quot;{borrar?.display_name || borrar?.clave}&quot;?</DialogTitle>
            <DialogDescription>
              Si tiene tareas asignadas el borrado se rechaza: en ese caso desactivalo en vez de
              borrarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarBorrado}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
