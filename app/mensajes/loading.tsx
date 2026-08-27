export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-52 rounded bg-muted" />
      <div className="h-9 rounded-lg bg-muted" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted/60" />
            <div className="h-3 w-4/5 rounded bg-muted/60" />
            <div className="h-9 rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
