import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function Onboarding() {
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, profile, refreshProfile, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!session) navigate("/auth", { replace: true });
    if (profile?.organization_id) navigate("/", { replace: true });
  }, [session, profile, navigate]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    // Ensure the Supabase client is primed with the latest auth tokens
    // (prevents DB requests being sent without the JWT in some environments)
    if (session?.access_token && session?.refresh_token) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }

    try {
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Create org
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: orgName, slug })
        .select()
        .single();
      if (orgError) throw orgError;

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      const isSuperadmin = user.email === "mashcatg@gmail.com";
      const role = isSuperadmin ? "superadmin" as const : "admin" as const;

      if (existingProfile) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            organization_id: org.id,
            role,
            full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          })
          .eq("id", user.id);
        if (updateError) throw updateError;
      } else {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email!,
            organization_id: org.id,
            role,
            full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          });
        if (profileError) throw profileError;
      }

      // Create default vault
      await supabase.from("vaults").insert({
        name: "General",
        description: "Default document vault",
        organization_id: org.id,
        created_by: user.id,
      });

      await refreshProfile();
      navigate("/", { replace: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border border-border shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">Set Up Your Organization</CardTitle>
          <CardDescription>Create your firm's workspace to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Smith & Associates" required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create Organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
