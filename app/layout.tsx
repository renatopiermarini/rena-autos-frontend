import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = { title: 'Renato Piermarini Autos' }

const NAV = [
  { href: '/',          label: 'Inicio'   },
  { href: '/stock',     label: 'Stock'    },
  { href: '/clientes',  label: 'Clientes' },
  { href: '/finanzas',  label: 'Finanzas' },
  { href: '/tareas',         label: 'Tareas'        },
  { href: '/transferencias', label: 'Transferencias' },
  { href: '/setup',          label: 'Setup'          },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-white text-gray-900 min-h-screen">
        <header className="border-b border-gray-200 px-8 py-4 flex items-center gap-8">
          <span className="font-semibold text-sm tracking-tight">Renato Piermarini Autos</span>
          <nav className="flex gap-6">
            {NAV.map(n => (
              <Link key={n.href} href={n.href}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
