import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-mono text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (!profile?.organization_id) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
