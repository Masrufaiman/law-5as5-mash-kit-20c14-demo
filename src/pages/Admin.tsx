import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LlmTab } from "@/components/admin/LlmTab";
import { SearchTab } from "@/components/admin/SearchTab";
import { StorageTab } from "@/components/admin/StorageTab";
import { KnowledgeTab } from "@/components/admin/KnowledgeTab";
import { AgentTab } from "@/components/admin/AgentTab";
import { FeedbackTab } from "@/components/admin/FeedbackTab";
import { Shield, Brain, Search, HardDrive, BookOpen, Bot, ThumbsUp, Scale } from "lucide-react";
import { Navigate } from "react-router-dom";
import { LegalApisTab } from "@/components/admin/LegalApisTab";

export default function Admin() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  if (!isAdmin) return <Navigate to="/" replace />;

  const orgId = profile?.organization_id;
  if (!orgId) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="h-full overflow-auto">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-xl font-semibold">Admin Panel</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Configure AI providers, search, and agent behavior.</p>
        </div>

        <div className="p-6">
          <Tabs defaultValue="llm" className="space-y-6">
            <TabsList className="bg-muted/50 border border-border h-auto flex-wrap gap-0.5 p-1">
              <TabsTrigger value="llm" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Brain className="h-3.5 w-3.5" /> LLM Providers
              </TabsTrigger>
              <TabsTrigger value="search" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Search className="h-3.5 w-3.5" /> Search & Research
              </TabsTrigger>
              <TabsTrigger value="legal_apis" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Scale className="h-3.5 w-3.5" /> Legal APIs
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <HardDrive className="h-3.5 w-3.5" /> Storage (R2)
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="agent" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Bot className="h-3.5 w-3.5" /> Agentic AI
              </TabsTrigger>
              <TabsTrigger value="feedback" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <ThumbsUp className="h-3.5 w-3.5" /> Feedback
              </TabsTrigger>
            </TabsList>

            <TabsContent value="llm"><LlmTab orgId={orgId} /></TabsContent>
            <TabsContent value="search"><SearchTab orgId={orgId} /></TabsContent>
            <TabsContent value="storage"><StorageTab orgId={orgId} /></TabsContent>
            <TabsContent value="knowledge"><KnowledgeTab orgId={orgId} /></TabsContent>
            <TabsContent value="agent"><AgentTab orgId={orgId} /></TabsContent>
            <TabsContent value="feedback"><FeedbackTab orgId={orgId} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
