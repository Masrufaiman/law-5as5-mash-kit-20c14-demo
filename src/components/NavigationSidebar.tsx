import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  FolderOpen,
  MessageSquare,
  Table2,
  FileText,
  Settings,
  LogOut,
  Shield,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: FolderOpen, label: "Vaults", path: "/" },
  { icon: MessageSquare, label: "Chat", path: "/chat" },
  { icon: Table2, label: "Review", path: "/review" },
  { icon: FileText, label: "Documents", path: "/documents" },
];

const adminItems = [
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: Shield, label: "Admin", path: "/admin" },
];

export function NavigationSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  return (
    <div className="flex h-full w-16 flex-col items-center border-r border-border bg-card py-4">
      <div className="mb-6 flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-heading text-sm font-bold">
        LK
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                  location.pathname === item.path
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}

        {isAdmin && (
          <>
            <div className="my-2 h-px w-6 bg-border" />
            {adminItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                      location.pathname === item.path
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </>
        )}
      </nav>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={signOut}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sign Out</TooltipContent>
      </Tooltip>
    </div>
  );
}
