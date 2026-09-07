'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificacionesBell } from '@/components/notificaciones-bell'
import { SettingsIcon, MessageSquareTextIcon } from 'lucide-react'

// ORDEN: lo diario primero. En 375px la barra corta cerca del cuarto ítem, así
// que lo que quede después hay que ir a buscarlo scrolleando. Adelante van las
// pantallas de todos los días (Tablero, Stock, Seguimientos, Visitas, Clientes,
// Tareas) y las que se abren cuando hay que hacer un papel (Documentos,
// Documentación). Finanzas baja: desde que el dashboard dejó de escribirla es
// de consulta, no de carga diaria. Cotizaciones y Mensajes se abren cuando
// llega un aviso o hay que contestar un WhatsApp; Verificaciones, cuando hay
// turno. Configuración va última: con el ícono de engranaje se reconoce sin
// leer la palabra.
//
// Sin gates por instancia: main es sólo Renato (Tincho vive en la branch
// `tincho`), así que todo lo que está acá se ve siempre. Lo único que depende
// del entorno es la campana — ver el prop `backend`.
const NAV: { href: string; label: string; icon?: typeof SettingsIcon }[] = [
  { href: '/',               label: 'Tablero'        },
  { href: '/stock',          label: 'Stock'          },
  // Seguimientos como entidad propia (antes eran tareas tipo `seguimiento`
  // que el Tablero escondía). La pantalla llega en la fase 5 del plan de IA
  // distribuida; hasta entonces es un "Próximamente".
  { href: '/seguimientos',   label: 'Seguimientos'   },
  { href: '/visitas',        label: 'Visitas'        },
  { href: '/clientes',       label: 'Clientes'       },
  { href: '/tareas',         label: 'Tareas'         },
  // Documentos = generar contratos (recibo de seña, mandato, boleto, recibo de
  // pago). Documentación = los papeles de cada auto. Son dos cosas distintas y
  // van pegadas para que se encuentren juntas.
  { href: '/documentos',     label: 'Documentos'     },
  { href: '/documentacion',  label: 'Documentación'  },
  { href: '/finanzas',       label: 'Finanzas'       },
  { href: '/cotizaciones',   label: 'Cotizaciones'   },
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
  backend = false,
}: {
  iniciales?: string
  titulo?: string
  /**
   * ¿Este entorno tiene backend del bot (BACKEND_URL + BACKEND_API_KEY)?
   * Enciende SÓLO la campana de avisos: el nav es el mismo con o sin backend.
   * Lo decide el layout en el server: acá `process.env` no existe. El default
   * `false` es a propósito — sin backend no hay nada del otro lado, y una
   * campana que siempre dice "No hay avisos" es peor que no tenerla.
   */
  backend?: boolean
} = {}) {
  const pathname = usePathname()
  const items = NAV

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
    // ResizeObserver además del resize de window: el ancho del scroller también
    // cambia sin resize (fuentes que terminan de cargar, zoom, breakpoint del
    // título en lg) y en 1024px el ítem cortado quedaba sin degradé (QA 2026-09-02).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', medir)
      window.removeEventListener('resize', medir)
      ro?.disconnect()
    }
  }, [medir, pathname])

  if (pathname === '/login') return null

  return (
    <header className="border-b border-border sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight shrink-0" aria-label={`${titulo} — Inicio`}>
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground text-2xs font-bold leading-none">{iniciales}</span>
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
          {backend && <NotificacionesBell />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
