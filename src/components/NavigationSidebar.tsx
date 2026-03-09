import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare,
  FolderOpen,
  Table2,
  FileText,
  Clock,
  BookOpen,
  Compass,
  Settings,
  Shield,
  HelpCircle,
  LogOut,
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface VaultItem {
  id: string;
  name: string;
}

interface RecentChat {
  id: string;
  title: string;
  created_at: string;
}

export function NavigationSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  const [vaultsOpen, setVaultsOpen] = useState(true);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setVaults(data || []));

    // Load recent conversations
    supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("organization_id", profile.organization_id)
      .order("updated_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentChats(data || []));
  }, [profile?.organization_id]);

  // Keyboard shortcut for search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const orgName = profile?.full_name?.split(" ")[0] || "LawKit";

  const mainNav = [
    { icon: MessageSquare, label: "Assistant", path: "/" },
  ];

  const bottomNav = [
    { icon: Table2, label: "Review", path: "/review" },
    { icon: FileText, label: "Documents", path: "/documents" },
    { icon: Clock, label: "History", path: "/history" },
    { icon: BookOpen, label: "Library", path: "/library" },
    { icon: Compass, label: "Guidance", path: "/guidance" },
  ];

  const settingsNav = [
    { icon: Settings, label: "Settings", path: "/settings" },
    ...(isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
    { icon: HelpCircle, label: "Help", path: "/help" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <div className="flex h-full w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        {/* Org header */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-heading text-xs font-bold shrink-0">
            LK
          </div>
          <span className="font-heading text-sm font-semibold truncate flex-1">{orgName}</span>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Create button */}
        <div className="px-3 py-3">
          <Button
            size="sm"
            className="w-full justify-start gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 h-8 text-xs"
            onClick={() => navigate("/")}
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </Button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {mainNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(item.path)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}

          {/* Vault section with collapsible sub-items */}
          <div>
            <button
              onClick={() => {
                navigate("/vault");
                setVaultsOpen(!vaultsOpen);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive("/vault")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Vault</span>
              {vaultsOpen ? (
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              )}
            </button>
            {vaultsOpen && vaults.length > 0 && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                {vaults.map((vault) => (
                  <button
                    key={vault.id}
                    onClick={() => navigate(`/vault?vault=${vault.id}`)}
                    className="flex w-full items-center rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors truncate"
                  >
                    {vault.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Chats */}
          {recentChats.length > 0 && (
            <>
              <div className="my-2 h-px bg-sidebar-border" />
              <p className="text-[10px] font-medium text-sidebar-foreground/40 px-2.5 py-1 uppercase tracking-wider">
                Recent
              </p>
              <div className="space-y-0.5">
                {recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => navigate(`/chat?id=${chat.id}`)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors truncate",
                      location.search.includes(chat.id)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <MessageSquare className="h-3 w-3 shrink-0 opacity-50" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Separator */}
          <div className="my-2 h-px bg-sidebar-border" />

          {bottomNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(item.path)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
          {settingsNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(item.path)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Global search command palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search vaults, files, conversations..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => { setSearchOpen(false); navigate("/"); }}>
              <MessageSquare className="mr-2 h-4 w-4" />
              New conversation
            </CommandItem>
            <CommandItem onSelect={() => { setSearchOpen(false); navigate("/vault"); }}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Open vault
            </CommandItem>
          </CommandGroup>
          {recentChats.length > 0 && (
            <CommandGroup heading="Recent Chats">
              {recentChats.slice(0, 5).map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigate(`/chat?id=${c.id}`);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {c.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {vaults.length > 0 && (
            <CommandGroup heading="Vaults">
              {vaults.map((v) => (
                <CommandItem
                  key={v.id}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigate(`/vault?vault=${v.id}`);
                  }}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {v.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            <CommandItem onSelect={() => { setSearchOpen(false); navigate("/review"); }}>
              <Table2 className="mr-2 h-4 w-4" />
              Review Tables
            </CommandItem>
            <CommandItem onSelect={() => { setSearchOpen(false); navigate("/documents"); }}>
              <FileText className="mr-2 h-4 w-4" />
              Documents
            </CommandItem>
            <CommandItem onSelect={() => { setSearchOpen(false); navigate("/settings"); }}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </CommandItem>
            {isAdmin && (
              <CommandItem onSelect={() => { setSearchOpen(false); navigate("/admin"); }}>
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
