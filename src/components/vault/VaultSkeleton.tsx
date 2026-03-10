import { Skeleton } from "@/components/ui/skeleton";

interface VaultSkeletonProps {
  variant?: "grid" | "list";
}

export function VaultSkeleton({ variant = "grid" }: VaultSkeletonProps) {
  if (variant === "list") {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/30">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20 ml-auto" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-8 w-8 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-3">
            <Skeleton className="h-10 w-10 rounded" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
