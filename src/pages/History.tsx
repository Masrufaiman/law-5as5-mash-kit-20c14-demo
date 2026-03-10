import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, FileText, FolderOpen, Upload, Table2, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

interface ActivityItem {
  id: string;
  type: "chat" | "document" | "vault" | "file" | "sheet";
  action: string;
  title: string;
  timestamp: string;
  resourceId?: string;
}

function groupByDate(items: ActivityItem[]): Record<string, ActivityItem[]> {
  const groups: Record<string, ActivityItem[]> = {};
  for (const item of items) {
    const date = new Date(item.timestamp);
    let label: string;
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "MMMM d, yyyy");
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  chat: MessageSquare,
  document: FileText,
  vault: FolderOpen,
  file: Upload,
  sheet: Table2,
};

const TYPE_COLORS: Record<string, string> = {
  chat: "bg-primary/10 text-primary",
  document: "bg-chart-1/10 text-chart-1",
  vault: "bg-chart-2/10 text-chart-2",
  file: "bg-chart-3/10 text-chart-3",
  sheet: "bg-chart-4/10 text-chart-4",
};

const FILTERS = ["All", "Chats", "Documents", "Vault", "Files"];

export default function History() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    if (!profile?.organization_id) return;
    loadActivities();
  }, [profile?.organization_id]);

  const loadActivities = async () => {
    if (!profile?.organization_id) return;
    setIsLoading(true);

    const [convRes, fileRes, docRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, title, created_at, updated_at")
        .eq("organization_id", profile.organization_id)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("files")
        .select("id, name, created_at, vault_id")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("documents")
        .select("id, title, created_at, updated_at")
        .eq("organization_id", profile.organization_id)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const items: ActivityItem[] = [];

    (convRes.data || []).forEach((c) => {
      items.push({
        id: `conv-${c.id}`,
        type: "chat",
        action: "Started conversation",
        title: c.title,
        timestamp: c.created_at,
        resourceId: c.id,
      });
    });

    (fileRes.data || []).forEach((f) => {
      items.push({
        id: `file-${f.id}`,
        type: "file",
        action: "Uploaded file",
        title: f.name,
        timestamp: f.created_at,
      });
    });

    (docRes.data || []).forEach((d) => {
      items.push({
        id: `doc-${d.id}`,
        type: "document",
        action: "Created document",
        title: d.title,
        timestamp: d.created_at,
      });
    });

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setActivities(items);
    setIsLoading(false);
  };

  const filteredActivities = activities.filter((a) => {
    if (filter === "All") return true;
    if (filter === "Chats") return a.type === "chat";
    if (filter === "Documents") return a.type === "document";
    if (filter === "Vault") return a.type === "vault";
    if (filter === "Files") return a.type === "file";
    return true;
  });

  const grouped = groupByDate(filteredActivities);

  const handleClick = (item: ActivityItem) => {
    if (item.type === "chat" && item.resourceId) {
      navigate(`/chat?id=${item.resourceId}`);
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h1 className="text-lg font-heading font-semibold text-foreground">Activity</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Your recent activity across the platform</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 px-6 py-3 border-b border-border/30">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto px-6 py-6">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(grouped).map(([dateLabel, items]) => (
                  <div key={dateLabel}>
                    <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">{dateLabel}</h3>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const Icon = TYPE_ICONS[item.type] || MessageSquare;
                        const colorClass = TYPE_COLORS[item.type] || "bg-muted text-muted-foreground";
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleClick(item)}
                            className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted/50 transition-colors group"
                          >
                            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", colorClass)}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{item.title}</p>
                              <p className="text-[10px] text-muted-foreground">{item.action}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </AppLayout>
  );
}
