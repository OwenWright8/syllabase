import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { PushoverNotificationSettings } from "@/components/notifications/PushoverNotificationSettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { applyColorTheme, colorThemes } from "@/lib/colorThemes";
import { SUPABASE_URL } from "@/lib/runtimeConfig";
import { Clock, CalendarDays } from "lucide-react";
import { WidgetApiKeySection } from "@/components/WidgetApiKeySection";
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

interface Profile {
  id: string;
  email: string;
  timezone: string;
  theme_preference: "light" | "dark" | "system";
  color_theme: string;
  created_at: string;
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const { theme, setTheme, setColorTheme: updateContextColorTheme } = useTheme();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");
  const [colorTheme, setColorTheme] = useState("sage");
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "system">("system");
  const [semesterStart, setSemesterStart] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setProfile(data as Profile);
        setTimezone(data.timezone || "America/New_York");
        setColorTheme(data.color_theme || "sage");
        const themePref = data.theme_preference as "light" | "dark" | "system";
        setThemePreference(themePref || "system");
        setSemesterStart(data.semester_start || "");
        
        // Update color theme in context
        updateContextColorTheme(data.color_theme || "sage");
        
        // Apply color theme
        const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        applyColorTheme(data.color_theme || "sage", isDark);
      } else {
        // Profile doesn't exist, create it
        const { data: newProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            theme_preference: "system",
            timezone: "America/New_York",
            color_theme: "sage",
          })
          .select()
          .single();

        if (insertError) throw insertError;
        
        if (newProfile) {
          setProfile(newProfile as Profile);
          setThemePreference("system");
          setTimezone("America/New_York");
          setColorTheme("sage");
          
          // Update color theme in context
          updateContextColorTheme("sage");
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          timezone: timezone,
          theme_preference: themePreference,
          color_theme: colorTheme,
          semester_start: semesterStart || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Update theme preference
      if (themePreference !== "system") {
        setTheme(themePreference);
      } else {
        // Handle system preference
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setTheme(prefersDark ? "dark" : "light");
      }
      
      // Update color theme in context so it persists across theme changes
      updateContextColorTheme(colorTheme);
      
      // Apply color theme immediately
      const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      applyColorTheme(colorTheme, isDark);
      
      toast.success("Profile updated successfully");
      loadProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteDialog(true);
  };

  const confirmDeleteAccount = async () => {
    if (!user) return;

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("No active session found. Please log in again.");
        return;
      }

      // Call the edge function to delete the user account and all data
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Error deleting account:", data);
        toast.error(data.error || "Failed to delete account. Please try again.");
        return;
      }

      // Account successfully deleted, now sign out
      toast.success("Your account and all data have been permanently deleted.");
      await signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("User email not found");
      return;
    }

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setChangingPassword(true);

    try {
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Current password is incorrect");
        setChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Error changing password:", error);
      toast.error(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Account Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your profile and preferences
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => navigate("/archive")} 
              variant="outline"
              className="gap-2 rounded-xl"
            >
              <Clock className="h-4 w-4" />
              Archive
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Account Info */}
          <div className="col-span-12 lg:col-span-6 glass-strong rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-foreground mb-1">Account Information</h3>
            <p className="text-xs text-muted-foreground mb-4">Your account details</p>
            <div>
              <Label className="text-sm">Email</Label>
              <Input value={user?.email || ""} disabled className="mt-1 rounded-xl" />
            </div>
          </div>

          {/* Profile Settings */}
          <div className="col-span-12 lg:col-span-6 glass-strong rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-foreground mb-1">Profile Settings</h3>
            <p className="text-xs text-muted-foreground mb-4">Customize your profile</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="semesterStart" className="text-sm flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Semester Start Date
                </Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Used to calculate current week number
                </p>
                <Input 
                  type="date" 
                  value={semesterStart}
                  onChange={(e) => setSemesterStart(e.target.value)}
                  className="mt-1 rounded-xl max-w-[200px]"
                />
              </div>
              <div>
                <Label htmlFor="timezone" className="text-sm">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                    <SelectItem value="America/Phoenix">Arizona (MST)</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska Time (AKT)</SelectItem>
                    <SelectItem value="Pacific/Honolulu">Hawaii Time (HST)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                    <SelectItem value="Asia/Shanghai">Shanghai (CST)</SelectItem>
                    <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney (AEDT/AEST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="theme" className="text-sm">Theme Preference</Label>
                <Select value={themePreference} onValueChange={(value: "light" | "dark" | "system") => setThemePreference(value)}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="colorTheme" className="text-sm">
                  Color Palette
                </Label>
                <Select value={colorTheme} onValueChange={setColorTheme}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(colorThemes)
                      .map((theme) => (
                        <SelectItem key={theme.name} value={theme.name}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{
                                background: `linear-gradient(135deg, hsl(${theme.colors.light.primary}), hsl(${theme.colors.light.accent}))`
                              }}
                            />
                            {theme.label}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdateProfile} className="rounded-xl">
                Save Changes
              </Button>
            </div>
          </div>

          {/* Notification Settings */}
          <PushoverNotificationSettings />

          {/* Password Change */}
          <div className="col-span-12 lg:col-span-6 glass-strong rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-foreground mb-1">Change Password</h3>
            <p className="text-xs text-muted-foreground mb-4">Update your password</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="currentPassword" className="text-sm">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label htmlFor="newPassword" className="text-sm">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-sm">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 rounded-xl"
                />
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword} className="rounded-xl">
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </div>

          {/* Homepage Widget */}
          <WidgetApiKeySection />

          {/* Delete Account */}
          <div className="col-span-12 glass-strong rounded-2xl p-5 border border-destructive/30">
            <h3 className="text-lg font-semibold text-destructive mb-1">Delete Account</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Permanently delete your account and all associated data
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              This action cannot be undone. All your courses, assignments, exams, and study data will be permanently deleted.
            </p>
            <Button 
              variant="destructive" 
              className="rounded-xl"
              onClick={handleDeleteAccount}
            >
              Delete My Account
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account
              and remove all your data including courses, assignments, exams, and study plans
              from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
