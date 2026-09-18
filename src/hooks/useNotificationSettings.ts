import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface NotificationSettings {
  user_id: string;
  pushover_user_key: string | null;
  pushover_app_token: string | null;
  pushover_device: string | null;
  enabled: boolean;
  assignments_enabled: boolean;
  assignments_lead_hours: number;
  exams_enabled: boolean;
  exams_lead_days: number[];
  quizzes_enabled: boolean;
  quizzes_lead_days: number[];
  daily_digest_enabled: boolean;
  daily_digest_time: string;
}

export const notificationSettingsKeys = {
  detail: (userId: string) => ["notification-settings", userId] as const,
};

// A default settings row is created for every user by the handle_new_user
// trigger, but fall back to sane defaults client-side too in case that
// hasn't landed yet (e.g. right after signup).
function defaults(userId: string): NotificationSettings {
  return {
    user_id: userId,
    pushover_user_key: null,
    pushover_app_token: null,
    pushover_device: null,
    enabled: false,
    assignments_enabled: true,
    assignments_lead_hours: 24,
    exams_enabled: true,
    exams_lead_days: [7, 1],
    quizzes_enabled: true,
    quizzes_lead_days: [1],
    daily_digest_enabled: false,
    daily_digest_time: "08:00:00",
  };
}

export function useNotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: notificationSettingsKeys.detail(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return (data ?? defaults(user!.id)) as NotificationSettings;
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationSettings>) => {
      const { error } = await supabase
        .from("notification_settings")
        .upsert({ user_id: user!.id, ...updates }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: notificationSettingsKeys.detail(user.id) });
    },
  });

  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    try {
      await updateMutation.mutateAsync(updates);
      return { success: true };
    } catch (error) {
      toast.error("Failed to save notification settings");
      return { success: false, error };
    }
  };

  const sendTestNotification = async (pushoverUserKey: string, pushoverAppToken: string, pushoverDevice?: string | null) => {
    try {
      const { data, error } = await supabase.functions.invoke("test-pushover-notification", {
        body: { pushover_user_key: pushoverUserKey, pushover_app_token: pushoverAppToken, pushover_device: pushoverDevice || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Test notification sent — check your phone!");
      return { success: true };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test notification");
      return { success: false };
    }
  };

  return {
    settings: query.data ?? defaults(user?.id ?? ""),
    loading: query.isLoading,
    updateSettings,
    sendTestNotification,
    isSaving: updateMutation.isPending,
  };
}
