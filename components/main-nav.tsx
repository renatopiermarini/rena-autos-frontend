'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificacionesBell } from '@/components/notificaciones-bell'
import { SettingsIcon, MessageSquareTextIcon, MessageCircleIcon } from 'lucide-react'

// Twelve top-level items was five too many. Interesados lives under Clientes,
// Ofertas is gone, and the tablero replaced the separate calendario.
//
// ORDEN: lo diario primero. En 375px la barra corta cerca del cuarto ítem, así
// que lo que quede después hay que ir a buscarlo scrolleando — y Finanzas, que
// se abre todos los días, quedaba fuera de la pantalla. Adelante van las de
// todos los días (Chat, Tablero, Stock, Finanzas, Visitas) y lo que se usa de
// vez en cuando queda atrás. Configuración va última: con el ícono de engranaje
// se reconoce sin leer la palabra.
const NAV: { href: string; label: string; icon?: typeof SettingsIcon }[] = [
  // Chat va PRIMERO, antes que el Tablero: es la puerta más rápida a todo lo
  // demás (preguntar en criollo en vez de buscar la pantalla), y en 375px lo
  // primero es lo único que se ve sin scrollear. Sólo está en las instancias
  // con backend — ver el prop `chat`.
  { href: '/chat',           label: 'Chat', icon: MessageCircleIcon },
  { href: '/',               label: 'Tablero'        },
  { href: '/stock',          label: 'Stock'          },
  { href: '/finanzas',       label: 'Finanzas'       },
  { href: '/visitas',        label: 'Visitas'        },
  { href: '/clientes',       label: 'Clientes'       },
  { href: '/tareas',         label: 'Tareas'         },
  // En el lugar que tenía "Guía" (pantalla eliminada). NO está en todas las
  // instancias: ver el prop `mensajes` más abajo.
  { href: '/mensajes',       label: 'Mensajes', icon: MessageSquareTextIcon },
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
  mensajes = true,
  chat = false,
}: {
  iniciales?: string
  titulo?: string
  /**
   * ¿Esta instancia tiene "Mensajes frecuentes"? Lo decide el layout en el
   * server con mensajesHabilitados(config_negocio) — igual que el branding, acá
   * no se puede leer la DB. El default `true` es la instancia de Renato sin
   * config cargada, que es la que hoy la usa.
   */
  mensajes?: boolean
  /**
   * ¿Esta instancia tiene backend del bot (BACKEND_URL + BACKEND_API_KEY)?
   * Enciende el ítem "Chat" Y la campana de avisos, que salen del mismo lugar.
   * Lo decide el layout en el server: acá `process.env` no existe. El default
   * `false` es a propósito — sin backend no hay nada del otro lado, y un ítem
   * que lleva a una pantalla vacía es peor que no tenerlo.
   */
  chat?: boolean
} = {}) {
  const pathname = usePathname()
  const items = NAV.filter(n =>
    (n.href !== '/mensajes' || mensajes) && (n.href !== '/chat' || chat))

  // Indicador de overflow: en el celular la barra cortaba en "Clie…" sin ninguna
  // señal de que había más ítems a la derecha. El degradé aparece SÓLO del lado
  // al que todavía queda barra por scrollear (antes había un mask-image fijo,
  // que también degradaba cuando ya no quedaba nada).
  const scroller = useRef<HTMLElement | null>(null)
  const [fade, setFade] = useState({ izq: false, der: false })

  const medir = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 4px de tolerancia: los navegadores dejan scrollLeft fraccionario al final.
    setFade({ izq: el.scrollLeft > 4, der: el.scrollLeft < max - 4 })
  }, [])

  useEffect(() => {
    medir()
    const el = scroller.current
    if (!el) return
    el.addEventListener('scroll', medir, { passive: true })
    window.addEventListener('resize', medir)
    return () => {
      el.removeEventListener('scroll', medir)
      window.removeEventListener('resize', medir)
    }
  }, [medir, pathname])

  if (pathname === '/login') return null

  return (
    <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight shrink-0" aria-label={`${titulo} — Inicio`}>
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold leading-none">{iniciales}</span>
          <span className="hidden lg:inline">{titulo}</span>
        </Link>
        <div className="relative min-w-0 flex-1">
          <nav ref={scroller} className="flex gap-1 overflow-x-auto scrollbar-hide">
            {items.map(n => {
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
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-150',
              fade.izq ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-150',
              fade.der ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {chat && <NotificacionesBell />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
