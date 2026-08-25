'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Sub-navigation for a section that owns more than one screen. Interesados is a
// stage of being a cliente, not a peer of Finanzas, so it lives under Clientes
// instead of eating a top-level nav slot.

export function SectionNav({
  items, label = 'Secciones de clientes',
}: {
  items: { href: string; label: string }[]
  label?: string
}) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1 border-b border-border -mt-1 mb-4" aria-label={label}>
      {items.map(i => {
        const active = pathname === i.href
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md',
              active
                ? 'font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}

export const CLIENTES_NAV = [
  { href: '/clientes', label: 'Clientes' },
  { href: '/interesados', label: 'Interesados' },
]

export const CONFIG_NAV = [
  { href: '/config/negocio', label: 'Negocio' },
  { href: '/config/cuentas', label: 'Cuentas' },
  { href: '/config/equipo', label: 'Equipo' },
  { href: '/config/inversores', label: 'Inversores' },
]
