export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-32 bg-muted rounded" />
      <div className="space-y-2">
        {[0,1,2].map(i => <div key={i} className="h-16 bg-muted rounded border border-border" />)}
      </div>
    </div>
  )
}
