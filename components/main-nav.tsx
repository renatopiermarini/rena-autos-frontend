'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',               label: 'Inicio'        },
  { href: '/stock',          label: 'Stock'         },
  { href: '/interesados',    label: 'Interesados'   },
  { href: '/ofertas',        label: 'Ofertas'       },
  { href: '/visitas',        label: 'Visitas'       },
  { href: '/clientes',       label: 'Clientes'      },
  { href: '/finanzas',       label: 'Finanzas'      },
  { href: '/tareas',         label: 'Tareas'        },
  { href: '/kb',             label: 'KB'            },
  { href: '/transferencias', label: 'Transferencias' },
  { href: '/setup',          label: 'Setup'          },
]

export function MainNav() {
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-8 py-3 flex items-center gap-8">
        <Link href="/" className="font-semibold text-sm tracking-tight shrink-0">
          Renato Piermarini Autos
        </Link>
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
          {NAV.map(n => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                  active
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
