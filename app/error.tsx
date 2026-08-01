'use client'
import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TriangleAlertIcon, RotateCwIcon } from 'lucide-react'

// The app had no error boundary on any route: a throw anywhere rendered the bare
// Next.js error page, in English, with no way back.

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <Card size="sm" className="mx-auto max-w-lg mt-12">
      <CardContent className="py-8 text-center space-y-4">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-5" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-base font-semibold">Algo se rompió en esta pantalla</h1>
          <p className="text-sm text-muted-foreground">
            No se pudo cargar. Probá de nuevo — si sigue fallando, revisá que la base esté respondiendo.
          </p>
        </div>
        <Button size="sm" onClick={reset}>
          <RotateCwIcon className="size-4" /> Reintentar
        </Button>
        {error.digest && (
          <p className="text-xs text-muted-foreground tabular-nums">Referencia: {error.digest}</p>
        )}
      </CardContent>
    </Card>
  )
}
