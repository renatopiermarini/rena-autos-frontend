'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'

const NAV = [
  { href: '/',               label: 'Inicio'        },
  { href: '/agenda',         label: 'Agenda'        },
  { href: '/stock',          label: 'Stock'         },
  { href: '/interesados',    label: 'Interesados'   },
  { href: '/ofertas',        label: 'Ofertas'       },
  { href: '/visitas',        label: 'Visitas'       },
  { href: '/clientes',       label: 'Clientes'      },
  { href: '/finanzas',       label: 'Finanzas'      },
  { href: '/tareas',         label: 'Tareas'        },
  { href: '/kb',             label: 'KB'            },
  { href: '/transferencias', label: 'Transferencias' },
  { href: '/verificaciones', label: 'Verificaciones' },
]

export function MainNav() {
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight shrink-0" aria-label="Renato Piermarini Autos — Inicio">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold leading-none">RP</span>
          <span className="hidden lg:inline">Renato Piermarini Autos</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
          {NAV.map(n => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
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
