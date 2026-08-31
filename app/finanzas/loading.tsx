export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-20 bg-muted rounded" />
      {/* patrimonio (6 stat cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-muted rounded-lg border border-border" />)}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-muted rounded border border-border" />)}
      </div>
    </div>
  )
}
