import type { Metadata } from 'next'
import './globals.css'
import { Geist } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { MainNav } from '@/components/main-nav'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = { title: 'Renato Piermarini Autos' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn('font-sans', geist.variable)}>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <MainNav />
        <main className="mx-auto w-full max-w-[1600px] px-8 py-6">{children}</main>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
