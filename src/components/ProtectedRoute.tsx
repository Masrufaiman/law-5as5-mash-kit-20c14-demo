import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-56 border-r border-border flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="px-3 py-3">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <div className="px-3 space-y-1">
          <Skeleton className="h-7 w-full rounded-md" />
          <div className="ml-4 pl-3 border-l border-border space-y-1 mt-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-7 w-full rounded-md mt-2" />
          <div className="ml-4 pl-3 border-l border-border space-y-1 mt-1">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <div className="flex-1" />
        <div className="px-3 py-3 border-t border-border space-y-1">
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-20" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-2xl space-y-6 px-6">
            <div className="text-center space-y-3">
              <Skeleton className="h-10 w-32 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (!profile?.organization_id) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
