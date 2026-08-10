export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-20 bg-muted rounded" />
      {/* patrimonio (5 stat cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-xl border border-border" />)}
      </div>
      {/* cuentas (3 + total) */}
      <div className="grid grid-cols-6 gap-3">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl border border-border" />)}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-muted rounded border border-border" />)}
      </div>
    </div>
  )
}
