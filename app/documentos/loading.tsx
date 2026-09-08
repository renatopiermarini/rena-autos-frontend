export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-36 bg-muted rounded" />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded border border-border" />)}
        </div>
        <div className="h-96 bg-muted rounded border border-border" />
      </div>
    </div>
  )
}
