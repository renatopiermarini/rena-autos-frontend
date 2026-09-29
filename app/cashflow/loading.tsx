export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-56 bg-muted rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-lg border border-border" />)}
      </div>
      <div className="h-80 bg-muted rounded-lg border border-border" />
      <div className="h-72 bg-muted rounded-lg border border-border" />
    </div>
  )
}
