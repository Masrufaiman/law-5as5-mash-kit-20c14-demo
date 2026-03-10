import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  FolderOpen,
  Table2,
  Clock,
  Settings,
  Shield,
  HelpCircle,
  LogOut,
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  Share,
  Trash2,
  Pencil,
  PanelLeftClose,
  PanelLeft,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  const [collapsed, setCollapsed] = useState(false);
  const [vaultsOpen, setVaultsOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoadingVaults, setIsLoadingVaults] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [searchResults, setSearchResults] = useState<RecentChat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RecentChat | null>(null);
  const [renameTarget, setRenameTarget] = useState<RecentChat | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!profile?.organization_id) return;
    setIsLoadingVaults(true);
    setIsLoadingChats(true);

    const loadVaults = () => {
      supabase
        .from("vaults")
        .select("id, name")
        .eq("organization_id", profile.organization_id!)
        .order("created_at")
        .then(({ data }) => { setVaults(data || []); setIsLoadingVaults(false); });
    };

    loadVaults();

    supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("organization_id", profile.organization_id)
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { setRecentChats(data || []); setIsLoadingChats(false); });

    // Realtime subscription for vault changes (rename/delete/create)
    const vaultChannel = supabase
      .channel("sidebar-vaults")
      .on("postgres_changes", { event: "*", schema: "public", table: "vaults" }, () => {
        loadVaults();
      })
      .subscribe();

    return () => { supabase.removeChannel(vaultChannel); };
  }, [profile?.organization_id]);

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

  const handleSearchChange = useCallback(async (value: string) => {
    setSearchQuery(value);
    if (!value.trim() || !profile?.organization_id) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("organization_id", profile.organization_id)
      .ilike("title", `%${value}%`)
      .order("updated_at", { ascending: false })
      .limit(10);
    setSearchResults(data || []);
  }, [profile?.organization_id]);

  const handleShareChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from("conversations")
      .update({ share_token: token, is_public: true })
      .eq("id", chatId);
    if (error) {
      toast({ title: "Error", description: "Failed to share", variant: "destructive" });
      return;
    }
    const shareUrl = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied!", description: "Public share link copied to clipboard" });
  };

  const handleDeleteChat = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete conversation", variant: "destructive" });
    } else {
      setRecentChats((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast({ title: "Deleted", description: "Conversation deleted" });
      if (location.search.includes(deleteTarget.id)) {
        navigate("/chat", { replace: true });
      }
    }
    setDeleteTarget(null);
  };

  const handleRenameChat = async () => {
    if (!renameTarget || !renameValue.trim()) { setRenameTarget(null); return; }
    const { error } = await supabase
      .from("conversations")
      .update({ title: renameValue.trim() })
      .eq("id", renameTarget.id);
    if (error) {
      toast({ title: "Error", description: "Failed to rename", variant: "destructive" });
    } else {
      setRecentChats((prev) => prev.map((c) => c.id === renameTarget.id ? { ...c, title: renameValue.trim() } : c));
      toast({ title: "Renamed" });
    }
    setRenameTarget(null);
    setRenameValue("");
  };

  const orgName = profile?.full_name?.split(" ")[0] || "LawKit";

  // Removed Documents and Library
  const bottomNav = [
    { icon: Table2, label: "Workflows", path: "/workflows" },
    { icon: Clock, label: "History", path: "/history" },
  ];

  const settingsNav = [
    { icon: Settings, label: "Settings", path: "/settings" },
    ...(isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
    { icon: HelpCircle, label: "Help", path: "/help" },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Show only first 10 chats, rest via scroll
  const displayedChats = recentChats.slice(0, 10);

  return (
    <>
      <div className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-12" : "w-56"
      )}>
        {/* Org header */}
        <div className={cn("flex items-center border-b border-sidebar-border", collapsed ? "justify-center px-1 py-4" : "gap-2.5 px-4 py-4")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-heading text-xs font-bold shrink-0">
            LK
          </div>
          {!collapsed && <span className="font-heading text-sm font-semibold truncate flex-1">{orgName}</span>}
          <button
            onClick={() => collapsed ? setCollapsed(false) : setSearchOpen(true)}
            className={cn(
              "flex items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed ? "h-8 w-8 mt-2" : "h-6 w-6"
            )}
            title={collapsed ? "Expand sidebar" : "Search (⌘K)"}
          >
            {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Create button */}
        <div className={cn("py-3", collapsed ? "px-1.5" : "px-3")}>
          <Button
            size="sm"
            className={cn(
              "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 h-8 text-xs",
              collapsed ? "w-full justify-center p-0" : "w-full justify-start gap-2"
            )}
            onClick={() => navigate("/")}
            title="New Chat"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && "New Chat"}
          </Button>
        </div>

        {/* Main nav */}
        <nav className={cn("flex-1 min-h-0 space-y-0.5", collapsed ? "px-1 overflow-y-auto" : "px-2")}>
          {/* Assistant */}
          <div>
            <button
              onClick={() => navigate("/")}
              className={cn(
                "flex w-full items-center rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-1" : "gap-2.5 px-2.5",
                isActive("/")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? "Assistant" : undefined}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 text-left">Assistant</span>}
              {!collapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentsOpen(!recentsOpen);
                  }}
                  className="text-sidebar-foreground/40 hover:text-sidebar-foreground"
                >
                  {recentsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </button>
            {!collapsed && recentsOpen && (
              <ScrollArea className="max-h-[280px]">
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                  {isLoadingChats ? (
                    <>
                      <Skeleton className="h-3 w-20 mx-2 my-1 bg-sidebar-accent/30" />
                      <Skeleton className="h-3 w-24 mx-2 my-1 bg-sidebar-accent/30" />
                      <Skeleton className="h-3 w-16 mx-2 my-1 bg-sidebar-accent/30" />
                    </>
                  ) : displayedChats.length > 0 ? (
                    displayedChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn(
                          "group/chat flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                          location.search.includes(chat.id)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        <button
                          onClick={() => navigate(`/chat?id=${chat.id}`)}
                          className="flex items-center gap-1.5 min-w-0 flex-1"
                        >
                          <MessageSquare className="h-2.5 w-2.5 shrink-0 opacity-50" />
                          <span className="truncate">{chat.title}</span>
                        </button>
                        <div className="hidden group-hover/chat:flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setRenameTarget(chat); setRenameValue(chat.title); }}
                            className="p-0.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => handleShareChat(chat.id, e)}
                            className="p-0.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                            title="Share"
                          >
                            <Share className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(chat); }}
                            className="p-0.5 rounded hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-1 text-xs text-sidebar-foreground/40">No conversations yet</p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Vault section */}
          <div>
            <button
              onClick={() => {
                navigate("/vault");
                if (!collapsed) setVaultsOpen(!vaultsOpen);
              }}
              className={cn(
                "flex w-full items-center rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-1" : "gap-2.5 px-2.5",
                isActive("/vault")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? "Vault" : undefined}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 text-left">Vault</span>}
              {!collapsed && (vaultsOpen ? (
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              ))}
            </button>
            {!collapsed && vaultsOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                {isLoadingVaults ? (
                  <>
                    <Skeleton className="h-3 w-20 mx-2 my-1 bg-sidebar-accent/30" />
                    <Skeleton className="h-3 w-16 mx-2 my-1 bg-sidebar-accent/30" />
                    <Skeleton className="h-3 w-24 mx-2 my-1 bg-sidebar-accent/30" />
                  </>
                ) : vaults.length > 0 ? (
                  vaults.map((vault) => (
                    <button
                      key={vault.id}
                      onClick={() => navigate(`/vault?vault=${vault.id}`)}
                      className="flex w-full items-center rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors truncate"
                    >
                      {vault.name}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-1 text-xs text-sidebar-foreground/40">No vaults</p>
                )}
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="my-2 h-px bg-sidebar-border" />

          {bottomNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex w-full items-center rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-1" : "gap-2.5 px-2.5",
                isActive(item.path)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className={cn("border-t border-sidebar-border py-2 space-y-0.5", collapsed ? "px-1" : "px-2")}>
          {settingsNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex w-full items-center rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-1" : "gap-2.5 px-2.5",
                isActive(item.path)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          ))}
          <button
            onClick={signOut}
            className={cn(
              "flex w-full items-center rounded-md py-1.5 text-sm text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors",
              collapsed ? "justify-center px-1" : "gap-2.5 px-2.5"
            )}
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </div>

      {/* Search dialog */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput
          placeholder="Search conversations..."
          value={searchQuery}
          onValueChange={handleSearchChange}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults.length > 0 && (
            <CommandGroup heading="Conversations">
              {searchResults.map((r) => (
                <CommandItem
                  key={r.id}
                  onSelect={() => {
                    navigate(`/chat?id=${r.id}`);
                    setSearchOpen(false);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {recentChats.length > 0 && !searchQuery && (
            <CommandGroup heading="Recent Conversations">
              {recentChats.map((r) => (
                <CommandItem
                  key={r.id}
                  onSelect={() => {
                    navigate(`/chat?id=${r.id}`);
                    setSearchOpen(false);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename conversation</AlertDialogTitle>
          </AlertDialogHeader>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameChat()}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameChat}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
