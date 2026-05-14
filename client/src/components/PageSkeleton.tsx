import { Skeleton } from './ui/skeleton';
import { PageTransition } from './PageTransition';

export function PageSkeleton() {
  return (
    <PageTransition className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      
      {/* Stats/Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      
      {/* Main Content */}
      <Skeleton className="h-[400px] rounded-xl w-full" />
    </PageTransition>
  );
}
