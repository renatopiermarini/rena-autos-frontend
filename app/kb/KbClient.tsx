'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'

const TIPOS = ['proceso', 'faq', 'plantilla', 'leccion_aprendida'] as const
type Tipo = typeof TIPOS[number]

const TIPO_LABEL: Record<Tipo, string> = {
  proceso: 'Procesos',
  faq: 'FAQs',
  plantilla: 'Plantillas',
  leccion_aprendida: 'Lecciones aprendidas',
}

const TIPO_VARIANT: Record<Tipo, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  proceso: 'secondary',
  faq: 'default',
  plantilla: 'outline',
  leccion_aprendida: 'destructive',
}

type Entry = {
  id: number
  tipo: Tipo
  titulo: string
  resumen: string | null
  contenido: string
  tags: string | null
  autor: string | null
  created_at?: string
  updated_at?: string
}

type FormState = {
  tipo: Tipo
  titulo: string
  resumen: string
  contenido: string
  tags: string
  autor: string
}

function emptyForm(): FormState {
  return { tipo: 'faq', titulo: '', resumen: '', contenido: '', tags: '', autor: 'rena' }
}

function entryToForm(e: Entry): FormState {
  return {
    tipo: e.tipo,
    titulo: e.titulo ?? '',
    resumen: e.resumen ?? '',
    contenido: e.contenido ?? '',
    tags: e.tags ?? '',
    autor: e.autor ?? '',
  }
}

function cleanPayload(f: FormState) {
  const payload: Record<string, any> = { ...f }
  for (const k of Object.keys(payload)) {
    if (payload[k] === '') payload[k] = null
  }
  payload.tipo = f.tipo
  payload.titulo = f.titulo
  payload.contenido = f.contenido
  return payload
}

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default function KbClient({ entries }: { entries: Entry[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<number | null>(entries[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<Tipo | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())

  const selected = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = entries.filter(e => {
      if (tipoFilter !== 'all' && e.tipo !== tipoFilter) return false
      if (!q) return true
      const hay = `${e.titulo} ${e.resumen ?? ''} ${e.tags ?? ''} ${e.contenido}`.toLowerCase()
      return hay.includes(q)
    })
    const out: Record<Tipo, Entry[]> = { proceso: [], faq: [], plantilla: [], leccion_aprendida: [] }
    for (const e of filtered) {
      if (TIPOS.includes(e.tipo)) out[e.tipo].push(e)
    }
    return out
  }, [entries, query, tipoFilter])

  function startEdit() {
    if (!selected) return
    setForm(entryToForm(selected))
    setCreating(false)
    setFormOpen(true)
  }

  function startCreate() {
    setForm(emptyForm())
    setCreating(true)
    setFormOpen(true)
  }

  async function save() {
    if (!form.titulo || !form.contenido) {
      toast.error('Título y contenido son obligatorios')
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    try {
      if (creating) {
        const payload = { ...cleanPayload(form), created_at: now, updated_at: now }
        const res = await postRecord('kb_entries', payload)
        if (!res.ok) throw new Error('create_failed')
        const newId = res.data?.data?.id ?? res.data?.id
        if (newId) setSelectedId(newId)
        toast.success('Entrada creada')
      } else if (selected) {
        const payload = { ...cleanPayload(form), updated_at: now }
        const ok = await patchRecord('kb_entries', selected.id, payload)
        if (!ok) throw new Error('update_failed')
        toast.success('Entrada actualizada')
      }
      setFormOpen(false)
      router.refresh()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selected) return
    const ok = await deleteRecord('kb_entries', selected.id)
    if (ok) {
      toast.success('Entrada eliminada')
      setSelectedId(null)
      setDeleteOpen(false)
      router.refresh()
    } else {
      toast.error('Error al eliminar')
    }
  }

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6">
      <aside className="space-y-3">
        <Button onClick={startCreate} className="w-full">
          <PlusIcon /> Nueva entrada
        </Button>

        <Input
          placeholder="Buscar…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap gap-1">
          <Button
            size="xs"
            variant={tipoFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setTipoFilter('all')}
          >
            Todos
          </Button>
          {TIPOS.map(t => (
            <Button
              key={t}
              size="xs"
              variant={tipoFilter === t ? 'default' : 'outline'}
              onClick={() => setTipoFilter(t)}
            >
              {TIPO_LABEL[t]}
            </Button>
          ))}
        </div>

        <div className="space-y-4 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
          {TIPOS.map(tipo => {
            const items = grouped[tipo]
            if (!items.length) return null
            return (
              <div key={tipo}>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  {TIPO_LABEL[tipo]}
                </p>
                <ul className="space-y-0.5">
                  {items.map(e => (
                    <li key={e.id}>
                      <button
                        onClick={() => setSelectedId(e.id)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded-md text-sm truncate transition-colors',
                          selectedId === e.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground hover:bg-muted',
                        )}
                      >
                        {e.titulo || '(sin título)'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">KB vacía. Creá tu primera entrada.</p>
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {selected ? (
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={TIPO_VARIANT[selected.tipo]}>
                      {TIPO_LABEL[selected.tipo]}
                    </Badge>
                    {selected.autor && (
                      <span className="text-xs text-muted-foreground">por {selected.autor}</span>
                    )}
                  </div>
                  <CardTitle className="text-lg">{selected.titulo}</CardTitle>
                  {selected.resumen && (
                    <p className="text-sm text-muted-foreground">{selected.resumen}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <PencilIcon /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                    <Trash2Icon /> Eliminar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {selected.tags && (
                <div className="flex flex-wrap gap-1">
                  {selected.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/50 rounded-lg p-4 border border-border">
{selected.contenido}
              </pre>
              {selected.updated_at && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Actualizada: {new Date(selected.updated_at).toLocaleDateString('es-AR')}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Elegí una entrada o creá una nueva.
            </CardContent>
          </Card>
        )}
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{creating ? 'Nueva entrada' : 'Editar entrada'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select
                  value={form.tipo}
                  onChange={e => setForm({ ...form, tipo: e.target.value as Tipo })}
                  className={nativeSelectCls}
                >
                  {TIPOS.map(t => (
                    <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Autor</Label>
                <Input
                  value={form.autor}
                  onChange={e => setForm({ ...form, autor: e.target.value })}
                  placeholder="rena / fran"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={e => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Resumen</Label>
              <Input
                value={form.resumen}
                onChange={e => setForm({ ...form, resumen: e.target.value })}
                placeholder="1-2 frases (opcional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (csv)</Label>
              <Input
                value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })}
                placeholder="transferencia,papeles"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contenido</Label>
              <Textarea
                value={form.contenido}
                onChange={e => setForm({ ...form, contenido: e.target.value })}
                className="font-mono min-h-[260px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar entrada?</DialogTitle>
            <DialogDescription>
              Se eliminará &quot;{selected?.titulo}&quot;. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={remove}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
