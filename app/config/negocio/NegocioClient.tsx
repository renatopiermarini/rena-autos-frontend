'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseConfigNegocio, patchRecordDetailed, postRecord } from '@/lib/kapso'
import { keywordsToText, textToKeywords, jsonError } from '@/lib/config-negocio'
import { MENSAJES_CONFIG_KEY } from '@/lib/mensajes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FInput, FTextarea } from '@/components/form-fields'
import { ConfigMissingBanner } from '@/components/config-banner'
import { toast } from 'sonner'

type Kind = 'text' | 'number' | 'lines' | 'json'

type Campo = {
  clave: string
  label: string
  kind?: Kind
  hint?: string
  className?: string
}

// Las 16 claves de config_negocio, agrupadas por para qué sirven. El orden acá
// es el orden en pantalla; agregar una clave nueva es agregar una línea.
const GRUPOS: { titulo: string; descripcion: string; campos: Campo[] }[] = [
  {
    titulo: 'Identidad',
    descripcion: 'Cómo se llama el negocio en los mensajes y en los documentos.',
    campos: [
      { clave: 'nombre', label: 'Nombre', hint: 'Razón social / nombre completo de la agencia.' },
      { clave: 'short_name', label: 'Nombre corto', hint: 'El que usa el bot al hablar.' },
    ],
  },
  {
    titulo: 'Mandatario',
    descripcion: 'Quién firma los mandatos y las consignaciones. Va tal cual a los contratos.',
    campos: [
      { clave: 'mandatario_nombre', label: 'Nombre', className: 'md:col-span-2' },
      { clave: 'mandatario_dni', label: 'DNI' },
      { clave: 'mandatario_cuil', label: 'CUIL' },
      { clave: 'mandatario_domicilio', label: 'Domicilio', className: 'md:col-span-2' },
    ],
  },
  {
    titulo: 'Operación',
    descripcion: 'Reglas del día a día: a quién se le asignan las cosas, umbrales y comisiones.',
    campos: [
      { clave: 'default_assignee', label: 'Asignado por defecto', hint: 'Clave del equipo que recibe las tareas sin dueño.' },
      { clave: 'mechanic_key', label: 'Mecánico', hint: 'Clave del equipo que hace las verificaciones.' },
      { clave: 'ciudad_contratos', label: 'Ciudad de los contratos' },
      { clave: 'comision_consignacion_pct', label: 'Comisión consignación (%)', kind: 'number', hint: 'Porcentaje, no fracción: 5 = 5%.' },
      { clave: 'umbral_alerta_caja', label: 'Umbral alerta de caja', kind: 'number', hint: 'Por debajo de este saldo salta la alerta en el tablero.' },
      { clave: 'tablero_destacados', label: 'Destacados del tablero', hint: 'Claves del equipo con sección propia arriba del tablero, separadas por coma.' },
      {
        clave: MENSAJES_CONFIG_KEY, label: 'Pantalla «Mensajes frecuentes»',
        hint: 'Poné 1 para que aparezca en el menú (plantillas para copiar y pegar en WhatsApp). Vacío = no aparece.',
      },
      {
        clave: 'stock_keywords', label: 'Palabras clave de stock', kind: 'lines',
        className: 'md:col-span-2',
        hint: 'Una por línea. Se guardan como array JSON.',
      },
      {
        clave: 'stock_task_defaults', label: 'Tareas por defecto al ingresar un auto', kind: 'json',
        className: 'md:col-span-2',
        hint: 'JSON crudo. Avanzado: si no parsea, no se guarda nada.',
      },
    ],
  },
  {
    titulo: 'Branding',
    descripcion: 'Lo que se ve arriba a la izquierda y en la pestaña del navegador.',
    campos: [
      { clave: 'branding_iniciales', label: 'Iniciales', hint: 'Monograma del logo (2 letras).' },
      { clave: 'branding_titulo', label: 'Título', hint: 'Nombre en la barra y en la pestaña.' },
    ],
  },
]

const TODAS = GRUPOS.flatMap(g => g.campos)

export default function NegocioClient({ rows }: { rows: any[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Valor "de disco" por clave, ya en el formato que muestra cada control.
  const original = useMemo(() => {
    const record = parseConfigNegocio(rows)
    const out: Record<string, string> = {}
    for (const c of TODAS) {
      const raw = record[c.clave] ?? ''
      out[c.clave] = c.kind === 'lines' ? keywordsToText(raw) : raw
    }
    return out
  }, [rows])

  const idPorClave = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of rows) {
      if (typeof r?.clave === 'string' && r.id != null) out[r.clave] = Number(r.id)
    }
    return out
  }, [rows])

  const [form, setForm] = useState<Record<string, string>>(original)
  const set = (clave: string) => (v: string) => setForm(f => ({ ...f, [clave]: v }))

  const cambiadas = TODAS.filter(c => (form[c.clave] ?? '') !== (original[c.clave] ?? ''))
  const sinTabla = rows.length === 0

  async function guardar() {
    if (cambiadas.length === 0) return
    // Validar ANTES de escribir nada: un JSON roto no puede dejar la mitad de
    // las claves guardadas y la otra mitad no.
    for (const c of cambiadas) {
      if (c.kind !== 'json') continue
      const err = jsonError(form[c.clave] ?? '')
      if (err) {
        toast.error(`${c.label}: JSON inválido (${err}). No se guardó nada.`)
        return
      }
    }

    setSaving(true)
    const errores: string[] = []
    for (const c of cambiadas) {
      const texto = form[c.clave] ?? ''
      const valor = c.kind === 'lines' ? textToKeywords(texto) : texto
      const id = idPorClave[c.clave]
      const res = id
        ? await patchRecordDetailed('config_negocio', id, { valor })
        : await postRecord('config_negocio', { clave: c.clave, valor })
      if (!res.ok) errores.push(`${c.label}: ${res.error ?? 'error'}`)
    }
    setSaving(false)

    if (errores.length === 0) {
      toast.success(`${cambiadas.length} valor(es) guardado(s)`)
    } else {
      toast.error(errores.join(' · '))
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Negocio</h1>
        <div className="flex items-center gap-3">
          {cambiadas.length > 0 && (
            <span className="text-xs text-muted-foreground">{cambiadas.length} sin guardar</span>
          )}
          <Button onClick={guardar} disabled={saving || cambiadas.length === 0}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {sinTabla && <ConfigMissingBanner />}

      {GRUPOS.map(g => (
        <Card key={g.titulo}>
          <CardHeader className="border-b">
            <CardTitle className="text-base">{g.titulo}</CardTitle>
            <p className="text-sm text-muted-foreground">{g.descripcion}</p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {g.campos.map(c => {
                const value = form[c.clave] ?? ''
                if (c.kind === 'lines' || c.kind === 'json') {
                  return (
                    <FTextarea
                      key={c.clave}
                      label={c.label}
                      hint={c.hint}
                      className={[c.className, c.kind === 'json' ? '[&_textarea]:font-mono' : ''].filter(Boolean).join(' ')}
                      value={value}
                      onChange={set(c.clave)}
                      rows={c.kind === 'json' ? 6 : 4}
                    />
                  )
                }
                return (
                  <FInput
                    key={c.clave}
                    label={c.label}
                    hint={c.hint}
                    className={c.className}
                    value={value}
                    onChange={set(c.clave)}
                    type={c.kind === 'number' ? 'number' : 'text'}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
