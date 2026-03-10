import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, MessageSquare, FolderOpen, Search, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      {/* Animated gavel / scale illustration */}
      <div className="relative mb-8">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
          <span className="text-6xl font-heading font-black text-primary select-none animate-pulse">⚖</span>
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-20 rounded-full bg-primary/20 blur-sm" />
      </div>

      <h1 className="font-heading text-5xl font-bold text-foreground mb-2">404</h1>
      <p className="text-lg text-muted-foreground mb-1">Page not found</p>
      <p className="text-sm text-muted-foreground/70 mb-8 max-w-md text-center">
        The page you're looking for doesn't exist or has been moved. Let's get you back on track.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="h-3.5 w-3.5" />
          Go Back
        </Button>
        <Button onClick={() => navigate("/")} size="sm" className="gap-2">
          <Home className="h-3.5 w-3.5" />
          Home
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition-colors min-w-[200px]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">New Chat</p>
            <p className="text-[10px] text-muted-foreground">Start a conversation</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/vault")}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition-colors min-w-[200px]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-chart-2/10">
            <FolderOpen className="h-4 w-4 text-chart-2" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Vault</p>
            <p className="text-[10px] text-muted-foreground">Manage documents</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/history")}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition-colors min-w-[200px]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-chart-3/10">
            <Search className="h-4 w-4 text-chart-3" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">History</p>
            <p className="text-[10px] text-muted-foreground">Browse activity</p>
          </div>
        </button>
      </div>

      <p className="mt-12 text-[10px] text-muted-foreground/50">LawKit AI · Legal Research Platform</p>
    </div>
  );
};

export default NotFound;
