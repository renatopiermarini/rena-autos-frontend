export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-40 bg-muted rounded" />
      <div className="h-6 w-72 bg-muted rounded" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded border border-border" />)}
      </div>
    </div>
  )
}
