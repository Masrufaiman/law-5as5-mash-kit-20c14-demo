import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeedbackItem {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  feedback: "up" | "down";
  created_at: string;
  user_email?: string;
  conversation_title?: string;
}

export function FeedbackTab({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, [orgId]);

  const loadFeedback = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("message_feedback")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data?.length) {
      // Enrich with user emails and conversation titles
      const userIds = [...new Set(data.map((d: any) => d.user_id))];
      const convIds = [...new Set(data.map((d: any) => d.conversation_id).filter(Boolean))];

      const [profilesRes, convsRes] = await Promise.all([
        supabase.from("profiles").select("id, email").in("id", userIds),
        convIds.length > 0
          ? supabase.from("conversations").select("id, title").in("id", convIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.email]));
      const convMap = new Map((convsRes.data || []).map((c: any) => [c.id, c.title]));

      setItems(
        data.map((d: any) => ({
          ...d,
          user_email: profileMap.get(d.user_id) || "Unknown",
          conversation_title: convMap.get(d.conversation_id) || "—",
        }))
      );
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  const upCount = items.filter((i) => i.feedback === "up").length;
  const downCount = items.filter((i) => i.feedback === "down").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <ThumbsUp className="h-4 w-4 text-primary" />
          <span className="font-medium">{upCount}</span>
          <span className="text-muted-foreground">positive</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <ThumbsDown className="h-4 w-4 text-destructive" />
          <span className="font-medium">{downCount}</span>
          <span className="text-muted-foreground">negative</span>
        </div>
      </div>

      <ScrollArea className="h-[500px]">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No feedback yet</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                  item.feedback === "up" ? "bg-primary/10" : "bg-destructive/10"
                }`}>
                  {item.feedback === "up" ? (
                    <ThumbsUp className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{item.conversation_title}</p>
                  <p className="text-[10px] text-muted-foreground">{item.user_email}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
