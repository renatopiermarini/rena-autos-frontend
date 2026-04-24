'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'

const TIPOS = ['proceso', 'faq', 'plantilla', 'leccion_aprendida'] as const
type Tipo = typeof TIPOS[number]

const TIPO_LABEL: Record<Tipo, string> = {
  proceso: 'Procesos',
  faq: 'FAQs',
  plantilla: 'Plantillas',
  leccion_aprendida: 'Lecciones aprendidas',
}

const TIPO_COLOR: Record<Tipo, string> = {
  proceso: 'bg-blue-100 text-blue-700',
  faq: 'bg-green-100 text-green-700',
  plantilla: 'bg-purple-100 text-purple-700',
  leccion_aprendida: 'bg-yellow-100 text-yellow-700',
}

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

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

export default function KbClient({ entries }: { entries: Entry[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<number | null>(entries[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<Tipo | 'all'>('all')
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    setEditing(true)
    setCreating(false)
    setError('')
  }

  function startCreate() {
    setForm(emptyForm())
    setCreating(true)
    setEditing(false)
    setError('')
  }

  function cancel() {
    setEditing(false)
    setCreating(false)
    setError('')
  }

  async function save() {
    if (!form.titulo || !form.contenido) {
      setError('Título y contenido son obligatorios.')
      return
    }
    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    try {
      if (creating) {
        const payload = { ...cleanPayload(form), created_at: now, updated_at: now }
        const res = await postRecord('kb_entries', payload)
        if (!res.ok) throw new Error('create_failed')
        setCreating(false)
        const newId = res.data?.data?.id ?? res.data?.id
        if (newId) setSelectedId(newId)
      } else if (editing && selected) {
        const payload = { ...cleanPayload(form), updated_at: now }
        const ok = await patchRecord('kb_entries', selected.id, payload)
        if (!ok) throw new Error('update_failed')
        setEditing(false)
      }
      router.refresh()
    } catch {
      setError('Error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selected) return
    if (!confirm(`¿Eliminar "${selected.titulo}"?`)) return
    const ok = await deleteRecord('kb_entries', selected.id)
    if (ok) {
      setSelectedId(null)
      router.refresh()
    }
  }

  const formOpen = editing || creating

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      {/* Sidebar */}
      <aside className="space-y-3">
        <button
          onClick={startCreate}
          className="w-full bg-gray-900 text-white text-sm rounded px-3 py-2 hover:bg-gray-700"
        >
          + Nueva entrada
        </button>

        <input
          type="text"
          placeholder="Buscar…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className={inputCls}
        />

        <div className="flex flex-wrap gap-1">
          <FilterChip active={tipoFilter === 'all'} onClick={() => setTipoFilter('all')}>
            Todos
          </FilterChip>
          {TIPOS.map(t => (
            <FilterChip key={t} active={tipoFilter === t} onClick={() => setTipoFilter(t)}>
              {TIPO_LABEL[t]}
            </FilterChip>
          ))}
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {TIPOS.map(tipo => {
            const items = grouped[tipo]
            if (!items.length) return null
            return (
              <div key={tipo}>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">
                  {TIPO_LABEL[tipo]}
                </p>
                <ul className="space-y-1">
                  {items.map(e => (
                    <li key={e.id}>
                      <button
                        onClick={() => { setSelectedId(e.id); setEditing(false); setCreating(false) }}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${
                          selectedId === e.id
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
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
            <p className="text-sm text-gray-400">KB vacía. Creá tu primera entrada.</p>
          )}
        </div>
      </aside>

      {/* Panel */}
      <section className="min-w-0">
        {formOpen ? (
          <EntryForm
            form={form}
            setForm={setForm}
            saving={saving}
            error={error}
            onSave={save}
            onCancel={cancel}
            isNew={creating}
          />
        ) : selected ? (
          <EntryView
            entry={selected}
            onEdit={startEdit}
            onDelete={remove}
          />
        ) : (
          <p className="text-sm text-gray-400">Elegí una entrada o creá una nueva.</p>
        )}
      </section>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  )
}

function EntryView({ entry, onEdit, onDelete }: { entry: Entry; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_COLOR[entry.tipo]}`}>
              {TIPO_LABEL[entry.tipo]}
            </span>
            {entry.autor && (
              <span className="text-xs text-gray-400">por {entry.autor}</span>
            )}
          </div>
          <h1 className="text-lg font-semibold">{entry.titulo}</h1>
          {entry.resumen && (
            <p className="text-sm text-gray-500 mt-1">{entry.resumen}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      </div>

      {entry.tags && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
            <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}

      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-4">
{entry.contenido}
      </pre>

      {entry.updated_at && (
        <p className="text-xs text-gray-400">
          Actualizada: {new Date(entry.updated_at).toLocaleDateString('es-AR')}
        </p>
      )}
    </div>
  )
}

function EntryForm({
  form, setForm, saving, error, onSave, onCancel, isNew,
}: {
  form: FormState
  setForm: (f: FormState) => void
  saving: boolean
  error: string
  onSave: () => void
  onCancel: () => void
  isNew: boolean
}) {
  function set<K extends keyof FormState>(k: K) {
    return (v: FormState[K]) => setForm({ ...form, [k]: v })
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-base font-semibold">
        {isNew ? 'Nueva entrada' : 'Editar entrada'}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tipo</label>
          <select
            value={form.tipo}
            onChange={e => set('tipo')(e.target.value as Tipo)}
            className={inputCls}
          >
            {TIPOS.map(t => (
              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Autor</label>
          <input
            type="text"
            value={form.autor}
            onChange={e => set('autor')(e.target.value)}
            className={inputCls}
            placeholder="rena / fran"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Título</label>
        <input
          type="text"
          value={form.titulo}
          onChange={e => set('titulo')(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Resumen</label>
        <input
          type="text"
          value={form.resumen}
          onChange={e => set('resumen')(e.target.value)}
          className={inputCls}
          placeholder="1-2 frases (opcional)"
        />
      </div>

      <div>
        <label className={labelCls}>Tags (csv)</label>
        <input
          type="text"
          value={form.tags}
          onChange={e => set('tags')(e.target.value)}
          className={inputCls}
          placeholder="transferencia,papeles"
        />
      </div>

      <div>
        <label className={labelCls}>Contenido</label>
        <textarea
          value={form.contenido}
          onChange={e => set('contenido')(e.target.value)}
          className={`${inputCls} font-mono`}
          rows={14}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-gray-900 text-white text-sm rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm px-4 py-2 rounded border border-gray-200 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
