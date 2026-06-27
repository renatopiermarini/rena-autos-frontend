export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-6 w-24 bg-muted rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[0,1,2].map(i => <div key={i} className="h-20 bg-muted rounded border border-border" />)}
      </div>
      <div className="space-y-2">
        {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-muted rounded border border-border" />)}
      </div>
    </div>
  )
}
