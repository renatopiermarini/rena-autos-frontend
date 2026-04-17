export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 bg-gray-200 rounded" />
        <div className="h-8 w-28 bg-gray-100 rounded border border-gray-200" />
      </div>
      <div className="flex gap-2">
        {[0,1,2,3].map(i => <div key={i} className="h-6 w-20 bg-gray-100 rounded-full border border-gray-200" />)}
      </div>
      {['Alta', 'Media', 'Baja'].map(p => (
        <div key={p} className="space-y-2">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          {[0,1].map(i => <div key={i} className="h-12 bg-gray-100 rounded border border-gray-200" />)}
        </div>
      ))}
    </div>
  )
}
