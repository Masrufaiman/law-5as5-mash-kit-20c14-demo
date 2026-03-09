import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Users, Building2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Organization = Tables<"organizations">;
type Profile = Tables<"profiles">;

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    const load = async () => {
      const [orgRes, membersRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.organization_id!)
          .single(),
        supabase
          .from("profiles")
          .select("*")
          .eq("organization_id", profile.organization_id!),
      ]);
      setOrg(orgRes.data);
      setMembers(membersRes.data || []);
      setLoading(false);
    };
    load();
  }, [profile?.organization_id]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Saved", description: "Profile updated." });
    }
    setSaving(false);
  };

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  return (
    <AppLayout>
      <div className="flex h-full flex-col overflow-auto">
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-xl font-semibold text-foreground">Settings</h1>
        </div>

        <div className="p-6 space-y-6 max-w-2xl">
          {/* Profile */}
          <Card className="border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Your Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={updateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || ""} disabled className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div>
                    <Badge variant="outline">{profile?.role}</Badge>
                  </div>
                </div>
                <Button type="submit" disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Organization */}
          <Card className="border border-border shadow-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Organization</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : org ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium text-foreground">{org.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <Badge variant="secondary">{org.plan}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Max Users</p>
                      <p className="font-mono text-sm">{org.max_users}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Storage</p>
                      <p className="font-mono text-sm">{org.max_storage_gb} GB</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Files</p>
                      <p className="font-mono text-sm">{org.max_files}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Organization not found.</p>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          {isAdmin && (
            <Card className="border border-border shadow-none">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Team Members</CardTitle>
                </div>
                <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.full_name || member.email}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">{member.email}</p>
                        </div>
                        <Badge variant="outline">{member.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
