export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 bg-muted rounded" />
        <div className="h-8 w-28 bg-muted rounded border border-border" />
      </div>
      <div className="flex gap-2">
        {[0,1,2,3].map(i => <div key={i} className="h-6 w-20 bg-muted rounded-full border border-border" />)}
      </div>
      {['Alta', 'Media', 'Baja'].map(p => (
        <div key={p} className="space-y-2">
          <div className="h-4 w-16 bg-muted rounded" />
          {[0,1].map(i => <div key={i} className="h-12 bg-muted rounded border border-border" />)}
        </div>
      ))}
    </div>
  )
}
