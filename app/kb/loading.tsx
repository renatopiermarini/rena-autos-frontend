export default function Loading() {
  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 bg-muted rounded border border-border" />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-muted rounded border border-border" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-6 w-40 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
        <div className="h-40 bg-muted/50 rounded border border-border" />
      </div>
    </div>
  )
}
