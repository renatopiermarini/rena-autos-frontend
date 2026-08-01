import type { Metadata } from 'next'
import './globals.css'
import { Geist, Archivo } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { MainNav } from '@/components/main-nav'
import { ThemeProvider } from '@/components/theme-provider'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })
// Plate lettering. Argentine patentes are set in an engineered squarish grotesque
// built to be read at distance and at speed; Archivo is the closest workhorse with
// that skeleton. Used only where the surface is behaving like a plate.
const archivo = Archivo({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-plate' })

export const metadata: Metadata = { title: 'Renato Piermarini Autos' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn('font-sans', geist.variable, archivo.variable)} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {/* Direction contract, emitted as a real HTML comment so it survives the
            production build and can be audited against the render. A JSX comment
            would be stripped by the compiler and reach nobody. */}
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--
  THESIS: Every car in this business is its dominio, so the dashboard is a rack of
  plates, not a grid of stat tiles. Refuses the admin-shell card grid it replaces.
  OWN-WORLD: Mercosur patente. Retroreflective off-white plate fields with embossed
  edges and a deep Mercosur-blue band, mounted on a graphite body; engineered
  squarish grotesque for every number and dominio; red sticker strip for alerts.
  STORY: three people glance between customers and know what is on the lot, what is
  happening in the next 48h, and what is wrong.
  FIRST VIEWPORT: one full-width plate. Blue band carries the business and the date;
  the white field carries four monumental counts, each a link into its screen.
  FORM: candidate 3 of 7 (Mercosur patente), seed key 5447a942.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->` }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MainNav />
          <main className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 py-6">{children}</main>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
