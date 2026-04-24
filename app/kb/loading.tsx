export default function Loading() {
  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 bg-gray-100 rounded border border-gray-200" />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-gray-100 rounded border border-gray-200" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-64 bg-gray-100 rounded" />
        <div className="h-40 bg-gray-50 rounded border border-gray-200" />
      </div>
    </div>
  )
}
