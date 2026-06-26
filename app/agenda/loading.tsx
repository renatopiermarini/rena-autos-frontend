export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 bg-gray-200 rounded" />
        <div className="h-8 w-44 bg-gray-100 rounded-full border border-gray-200" />
      </div>
      <div className="h-8 w-40 bg-gray-100 rounded border border-gray-200" />
      <div className="h-[480px] bg-gray-100 rounded border border-gray-200" />
    </div>
  )
}
