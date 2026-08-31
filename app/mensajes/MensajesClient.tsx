'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import {
  TIPO_PLANTILLA, type Plantilla,
  tituloPlantilla, tagsDe, filtrarPlantillas, esLargo,
} from '@/lib/mensajes'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { FInput, FTextarea } from '@/components/form-fields'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { toast } from 'sonner'
import {
  PlusIcon, PencilIcon, Trash2Icon, CopyIcon, SearchIcon, MessageSquareTextIcon,
  ChevronDownIcon, ChevronUpIcon,
} from 'lucide-react'

type FormState = { titulo: string; contenido: string; tags: string }

const FORM_VACIO: FormState = { titulo: '', contenido: '', tags: '' }

function plantillaAForm(p: Plantilla): FormState {
  return { titulo: p.titulo ?? '', contenido: p.contenido ?? '', tags: p.tags ?? '' }
}

/**
 * Copiar al portapapeles.
 *
 * `navigator.clipboard` no existe en contexto inseguro ni en algunos WebView
 * viejos de Android — justo los teléfonos donde esta pantalla se usa. Ahí cae al
 * truco del textarea + execCommand, que es feo pero es lo que separa "copiar de
 * un toque" de "no anda". Devuelve si pudo, para no mentir con el toast.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Sigue al fallback.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function MensajesClient({
  plantillas, autor,
}: {
  plantillas: Plantilla[]
  /** Con qué firma se guarda una plantilla nueva (config_negocio.default_assignee). */
  autor: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [expandida, setExpandida] = useState<number | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  // Con qué contenido abrió el diálogo: contra esto se mide si hay algo sin
  // guardar (ver lib/dirty.ts). Sembrar no es ensuciar.
  const [inicial, setInicial] = useState<FormState>(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const [borrando, setBorrando] = useState<Plantilla | null>(null)

  const { dialogProps: formDialogProps, cerrar: cerrarForm } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange: setFormOpen,
  })

  const visibles = useMemo(() => filtrarPlantillas(plantillas, query), [plantillas, query])

  function abrirNueva() {
    setForm(FORM_VACIO)
    setInicial(FORM_VACIO)
    setEditandoId(null)
    setFormOpen(true)
  }

  function abrirEdicion(p: Plantilla) {
    const abierto = plantillaAForm(p)
    setForm(abierto)
    setInicial(abierto)
    setEditandoId(p.id)
    setFormOpen(true)
  }

  async function copiar(p: Plantilla) {
    if (await copiarTexto(p.contenido)) {
      toast.success('Copiado — pegalo en WhatsApp')
    } else {
      toast.error('No se pudo copiar. Abrí el mensaje y copialo a mano.')
    }
  }

  async function guardar() {
    const contenido = form.contenido.trim()
    if (!contenido) {
      toast.error('Escribí el texto del mensaje.')
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    // `tipo` va SIEMPRE 'plantilla': esta pantalla no puede crear entradas de
    // los otros tipos, que son la base de conocimiento del bot.
    const campos = {
      titulo: form.titulo.trim() || null,
      contenido,
      tags: form.tags.trim() || null,
      tipo: TIPO_PLANTILLA,
    }
    try {
      if (editandoId == null) {
        const res = await postRecord('kb_entries', {
          ...campos, autor, created_at: now, updated_at: now,
        })
        if (!res.ok) throw new Error(res.error ?? 'create_failed')
        toast.success('Mensaje guardado')
      } else {
        // `autor` no se pisa al editar: la firma es de quien lo escribió.
        const ok = await patchRecord('kb_entries', editandoId, { ...campos, updated_at: now })
        if (!ok) throw new Error('update_failed')
        toast.success('Mensaje actualizado')
      }
      setFormOpen(false)
      router.refresh()
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function borrar() {
    if (!borrando) return
    if (await deleteRecord('kb_entries', borrando.id)) {
      toast.success('Mensaje eliminado')
      setBorrando(null)
      router.refresh()
    } else {
      toast.error('No se pudo eliminar.')
    }
  }

  const vacia = plantillas.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes frecuentes</h1>
        <p className="text-sm text-muted-foreground">
          Los textos que más repetís por WhatsApp. Tocá «Copiar» y pegalos en el chat.
        </p>
      </div>

      {!vacia && (
        // Buscador y alta en la MISMA fila y arriba de todo: en el celular es lo
        // primero que cae bajo el pulgar al abrir la pantalla.
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar mensaje…"
              className="h-9 pl-8"
              aria-label="Buscar mensaje"
            />
          </div>
          <Button size="lg" onClick={abrirNueva} className="shrink-0">
            <PlusIcon /> Nuevo
          </Button>
        </div>
      )}

      {vacia ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={MessageSquareTextIcon}
              title="Todavía no hay mensajes"
              hint="Guardá acá los textos que mandás todo el tiempo — la seña, cómo llegar, los papeles que hay que traer — y copialos de un toque."
              action={<Button onClick={abrirNueva}><PlusIcon /> Crear el primero</Button>}
            />
          </CardContent>
        </Card>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={SearchIcon}
              title="Ningún mensaje coincide"
              hint={`No hay nada que diga «${query.trim()}». Probá con otra palabra.`}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visibles.map(p => {
            const abierta = expandida === p.id
            const largo = esLargo(p.contenido)
            const tags = tagsDe(p)
            return (
              <li key={p.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 flex-1 text-[15px] font-medium leading-snug">
                        {tituloPlantilla(p)}
                      </h2>
                      {/* Editar y borrar son secundarios a propósito: el 99% de
                          las veces se entra a esta pantalla a copiar, no a
                          administrar. */}
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={() => abrirEdicion(p)}
                          aria-label={`Editar ${tituloPlantilla(p)}`}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={() => setBorrando(p)}
                          aria-label={`Eliminar ${tituloPlantilla(p)}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>

                    <p
                      className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground ${abierta ? '' : 'line-clamp-3'}`}
                    >
                      {p.contenido}
                    </p>

                    {largo && (
                      <Button
                        variant="ghost" size="xs"
                        className="-ml-2 text-muted-foreground"
                        onClick={() => setExpandida(abierta ? null : p.id)}
                      >
                        {abierta ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        {abierta ? 'Ver menos' : 'Ver completo'}
                      </Button>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                      </div>
                    )}

                    {/* El botón grande, ancho completo y al final de la tarjeta:
                        es la única acción que importa y tiene que caer bajo el
                        pulgar sin apuntar. */}
                    <Button size="lg" className="h-10 w-full" onClick={() => copiar(p)}>
                      <CopyIcon /> Copiar
                    </Button>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={formOpen} {...formDialogProps}>
        <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoId == null ? 'Nuevo mensaje' : 'Editar mensaje'}</DialogTitle>
          </DialogHeader>
          <div className="-mr-1 flex-1 space-y-3 overflow-y-auto pr-1">
            <FInput
              label="Título"
              value={form.titulo}
              onChange={v => setForm({ ...form, titulo: v })}
              placeholder="Seña / Cómo llegar / Papeles"
              hint="Opcional: sin título se usa la primera línea del mensaje."
            />
            <FTextarea
              label="Mensaje"
              value={form.contenido}
              onChange={v => setForm({ ...form, contenido: v })}
              rows={10}
              placeholder="Hola! Gracias por escribir…"
              className="[&_textarea]:min-h-[220px] [&_textarea]:max-h-[50vh]"
              hint="Se copia tal cual, con los saltos de línea."
            />
            <FInput
              label="Etiquetas"
              value={form.tags}
              onChange={v => setForm({ ...form, tags: v })}
              placeholder="seña, papeles"
              hint="Opcional, separadas por coma. Sirven para buscar."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarForm} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={borrando !== null} onOpenChange={open => { if (!open) setBorrando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar el mensaje?</DialogTitle>
            <DialogDescription>
              Se elimina «{borrando ? tituloPlantilla(borrando) : ''}». No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrando(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={borrar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
