import type { LucideIcon } from 'lucide-react'
import { InboxIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon = InboxIcon, title, hint, action, className,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-10 px-4 text-center', className)}>
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground max-w-sm">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
