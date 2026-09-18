import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface WidgetApiKey {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export const widgetApiKeyKeys = {
  all: (userId: string) => ["widget-api-keys", userId] as const,
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `sp_${base64}`;
}

export function useWidgetApiKeys() {
  const { user } = useAuth();

  return useQuery({
    queryKey: widgetApiKeyKeys.all(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widget_api_keys")
        .select("id, label, created_at, last_used_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WidgetApiKey[];
    },
    enabled: !!user,
  });
}

/** Returns the plaintext key on success — the only time it's ever visible. */
export function useCreateWidgetApiKey() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (label: string) => {
      const plaintextKey = generateApiKey();
      const key_hash = await sha256Hex(plaintextKey);

      const { error } = await supabase.from("widget_api_keys").insert({
        user_id: user!.id,
        key_hash,
        label: label || null,
      });
      if (error) throw error;

      return plaintextKey;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: widgetApiKeyKeys.all(user.id) });
    },
  });
}

export function useDeleteWidgetApiKey() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.from("widget_api_keys").delete().eq("id", keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: widgetApiKeyKeys.all(user.id) });
    },
  });
}
