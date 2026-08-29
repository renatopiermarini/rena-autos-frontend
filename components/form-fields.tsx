'use client'
import { cloneElement, isValidElement, useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Campos de formulario compartidos. Son la MISMA marca que venían copiando a
 * mano las pantallas de transferencias/verificaciones/stock (label chiquito en
 * mayúsculas + control), extraída para que las pantallas nuevas no sumen una
 * cuarta copia. Las pantallas viejas siguen con su copia local: migrarlas es
 * otra pasada, no ésta.
 */

// text-base en móvil: iOS Safari zoomea la página (y no la devuelve) al enfocar
// un control con fuente < 16px. En md+ vuelve a text-sm, igual que el Input.
export const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

export function FField({
  label, children, hint, error, className = '', controlId,
}: {
  label: string
  children: React.ReactNode
  hint?: string
  /** error de validación: se muestra inline y marca el control con aria-invalid */
  error?: string
  className?: string
  /** id del control al que apunta el label; sin él, un hijo único sin id recibe uno generado */
  controlId?: string
}) {
  const autoId = useId()
  const descId = useId()
  const describe = error || hint ? descId : undefined
  let id = controlId
  let content = children
  if (!id && isValidElement(children)) {
    const childProps = children.props as { id?: string; 'aria-describedby'?: string }
    id = childProps.id ?? autoId
    content = cloneElement(children as React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>, {
      id,
      'aria-describedby': childProps['aria-describedby'] ?? describe,
      ...(error ? { 'aria-invalid': true } : {}),
    })
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      {content}
      {error
        ? <p id={descId} className="text-xs text-destructive">{error}</p>
        : hint && <p id={descId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function FInput({
  label, value, onChange, hint, error, className, ...props
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string
  className?: string
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'>) {
  return (
    <FField label={label} hint={hint} error={error} className={className}>
      <Input value={value} onChange={e => onChange(e.target.value)} {...props} />
    </FField>
  )
}

export function FTextarea({
  label, value, onChange, hint, error, className, rows = 3, ...props
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string
  className?: string
  rows?: number
} & Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange' | 'className' | 'rows'>) {
  return (
    <FField label={label} hint={hint} error={error} className={className}>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} {...props} />
    </FField>
  )
}

export function FSelect({
  label, value, onChange, options, hint, error, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  hint?: string
  error?: string
  className?: string
}) {
  return (
    <FField label={label} hint={hint} error={error} className={className}>
      <select value={value} onChange={e => onChange(e.target.value)} className={nativeSelectCls}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FField>
  )
}

export function FCheckbox({
  id, label, checked, onChange, hint,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 rounded border-input"
      />
      <div>
        <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
