import type { Metadata } from 'next'
import './globals.css'
import { Geist } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { MainNav } from '@/components/main-nav'
import { ThemeProvider } from '@/components/theme-provider'
import { getConfigNegocio } from '@/lib/kapso'
import { brandingFrom } from '@/lib/branding'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

// Branding desde config_negocio. Sin la tabla creada getConfigNegocio() devuelve
// {} y todo cae a los literales de siempre — el dashboard de Renato no cambia
// ni un pixel hasta que corra el DDL.
export async function generateMetadata(): Promise<Metadata> {
  return { title: brandingFrom(await getConfigNegocio()).titulo }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = brandingFrom(await getConfigNegocio())
  return (
    <html lang="es" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MainNav iniciales={branding.iniciales} titulo={branding.titulo} />
          <main className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-6">{children}</main>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
