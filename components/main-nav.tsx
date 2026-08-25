'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { SettingsIcon } from 'lucide-react'

// Twelve top-level items was five too many. Interesados lives under Clientes,
// Ofertas is gone, and the tablero replaced the separate calendario.
const NAV: { href: string; label: string; icon?: typeof SettingsIcon }[] = [
  { href: '/',               label: 'Tablero'        },
  { href: '/stock',          label: 'Stock'          },
  { href: '/visitas',        label: 'Visitas'        },
  { href: '/clientes',       label: 'Clientes'       },
  { href: '/finanzas',       label: 'Finanzas'       },
  { href: '/tareas',         label: 'Tareas'         },
  { href: '/kb',             label: 'KB'             },
  { href: '/transferencias', label: 'Transferencias' },
  { href: '/verificaciones', label: 'Verificaciones' },
  { href: '/config/negocio', label: 'Configuración', icon: SettingsIcon },
]

// El monograma y el nombre salen de config_negocio (branding_iniciales /
// branding_titulo), que el layout lee en el server y baja como props — esto es
// un client component y no puede leer la DB. Sin la tabla creada los defaults
// dejan el dashboard de Renato EXACTAMENTE como estaba.
export function MainNav({
  iniciales = 'RP',
  titulo = 'Renato Piermarini Autos',
}: {
  iniciales?: string
  titulo?: string
} = {}) {
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight shrink-0" aria-label={`${titulo} — Inicio`}>
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold leading-none">{iniciales}</span>
          <span className="hidden lg:inline">{titulo}</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
          {NAV.map(n => {
            // /config tiene cuatro pantallas: el ítem queda activo en todas.
            const base = n.href.startsWith('/config') ? '/config' : n.href
            const active = base === '/' ? pathname === '/' : pathname.startsWith(base)
            const Icon = n.icon
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                  Icon && 'inline-flex items-center gap-1.5',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {Icon && <Icon className="size-3.5" />}
                {n.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
