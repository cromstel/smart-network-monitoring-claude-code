import { Skeleton } from '@/components/ui/states'

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}
