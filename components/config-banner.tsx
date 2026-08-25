import { AlertTriangleIcon, InfoIcon } from 'lucide-react'

/**
 * Las tablas de configuración las crea el usuario a mano (D1 no acepta DDL
 * desde acá). Mientras no existan, las lecturas devuelven vacío y el dashboard
 * sigue andando con los valores hardcodeados: este banner explica por qué las
 * pantallas de config están en blanco en vez de dejar la duda.
 */
export function ConfigMissingBanner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning ${className}`}>
      <AlertTriangleIcon className="size-4 mt-0.5 shrink-0" />
      <p>
        Tablas de configuración no creadas — corré <code className="font-mono">scripts/ddl_config.sql</code>.
        Hasta entonces el bot y el dashboard usan los valores por defecto.
      </p>
    </div>
  )
}

/** Aviso fijo: cuentas y equipo los lee el bot al arrancar, no en caliente. */
export function RestartNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <InfoIcon className="size-4 mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
