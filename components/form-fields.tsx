'use client'
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

export const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function FField({
  label, children, hint, className = '',
}: {
  label: string
  children: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function FInput({
  label, value, onChange, hint, className, ...props
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  className?: string
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'>) {
  return (
    <FField label={label} hint={hint} className={className}>
      <Input value={value} onChange={e => onChange(e.target.value)} {...props} />
    </FField>
  )
}

export function FTextarea({
  label, value, onChange, hint, className, rows = 3, ...props
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  className?: string
  rows?: number
} & Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange' | 'className' | 'rows'>) {
  return (
    <FField label={label} hint={hint} className={className}>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} {...props} />
    </FField>
  )
}

export function FSelect({
  label, value, onChange, options, hint, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  hint?: string
  className?: string
}) {
  return (
    <FField label={label} hint={hint} className={className}>
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
