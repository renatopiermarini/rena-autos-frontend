export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-3 animate-pulse">
      <div className="flex-1 space-y-4 py-2">
        <div className="h-3 w-16 mx-auto rounded bg-muted" />
        <div className="h-12 w-3/5 rounded-2xl bg-muted" />
        <div className="ml-auto h-10 w-2/5 rounded-2xl bg-muted" />
        <div className="h-16 w-4/5 rounded-2xl bg-muted" />
      </div>
      <div className="h-12 shrink-0 rounded-2xl bg-muted" />
    </div>
  )
}
