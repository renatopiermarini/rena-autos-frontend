export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-28 bg-gray-200 rounded" />
      <div className="space-y-2">
        {[0,1,2].map(i => <div key={i} className="h-16 bg-gray-100 rounded border border-gray-200" />)}
      </div>
    </div>
  )
}
