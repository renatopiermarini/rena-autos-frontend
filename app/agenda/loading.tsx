export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 bg-muted rounded" />
        <div className="h-8 w-44 bg-muted rounded-full border border-border" />
      </div>
      <div className="h-8 w-40 bg-muted rounded border border-border" />
      <div className="h-[480px] bg-muted rounded border border-border" />
    </div>
  )
}
