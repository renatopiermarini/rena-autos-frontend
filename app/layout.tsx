import type { Metadata } from 'next'
import './globals.css'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { MainNav } from '@/components/main-nav'
import { ThemeProvider } from '@/components/theme-provider'
import { getConfigNegocio } from '@/lib/kapso'
import { brandingFrom } from '@/lib/branding'
import { backendHabilitado } from '@/lib/backend'

// IBM Plex: la voz "herramienta de operaciones" del design system (ver DESIGN.md).
// Sans para UI, Mono para plata/KPIs/tablas vía font-mono + tabular-nums.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
})

// Branding desde config_negocio. Sin la tabla creada getConfigNegocio() devuelve
// {} y todo cae a los literales de siempre — el dashboard de Renato no cambia
// ni un pixel hasta que corra el DDL.
export async function generateMetadata(): Promise<Metadata> {
  return { title: brandingFrom(await getConfigNegocio()).titulo }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // config_negocio sólo para el branding del nav: qué pantallas hay ya no
  // depende de la instancia (main es sólo Renato).
  const branding = brandingFrom(await getConfigNegocio())
  return (
    <html lang="es" className={cn('font-sans', plexSans.variable, plexMono.variable)} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MainNav
            iniciales={branding.iniciales}
            titulo={branding.titulo}
            // La campana vive del backend del bot. Se lee ACÁ, en el server,
            // porque BACKEND_API_KEY no puede cruzar al browser — igual que
            // `documentosHabilitado` en app/stock/page.tsx, y por la misma
            // razón (ver lib/backend.ts).
            backend={backendHabilitado()}
          />
          <main className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-6">{children}</main>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
