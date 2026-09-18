import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type ReadingStatus = "not_started" | "in_progress" | "done";

export interface Reading {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  pages: string | null;
  due_date: string | null;
  status: ReadingStatus;
  completed_at: string | null;
  flashcard_deck_id: string | null;
  task_id: string | null;
  exam_id: string | null;
  planned_date: string | null;
  plan_order: number | null;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    name: string;
    short_code: string;
    color: string;
  };
  // Set on synthetic Reading objects derived from a task (see Readings.tsx) —
  // absent on readings that come straight from the readings table.
  isTask?: boolean;
}

export const readingKeys = {
  // Broad prefix — invalidating this covers byCourse/upcoming too, since
  // react-query matches query keys by prefix.
  all: (userId: string) => ["readings", userId] as const,
  byCourse: (userId: string, courseId: string) => ["readings", userId, "course", courseId] as const,
  upcoming: (userId: string) => ["readings", userId, "upcoming"] as const,
};

function transformCourse<T extends { course: unknown }>(row: T) {
  return { ...row, course: Array.isArray(row.course) ? row.course[0] : row.course };
}

export function useReadings(courseId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: courseId ? readingKeys.byCourse(user?.id ?? "", courseId) : readingKeys.all(user?.id ?? ""),
    queryFn: async () => {
      let request = supabase
        .from("readings")
        .select(`*, course:courses (id, name, short_code, color)`)
        .eq("user_id", user!.id)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (courseId) {
        request = request.eq("course_id", courseId);
      }

      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map(transformCourse) as Reading[];
    },
    enabled: !!user,
  });

  const invalidateReadings = () => {
    if (user) queryClient.invalidateQueries({ queryKey: ["readings", user.id] });
  };

  const createMutation = useMutation({
    mutationFn: async (reading: {
      course_id: string;
      title: string;
      pages?: string;
      due_date?: string;
      flashcard_deck_id?: string;
      task_id?: string;
      exam_id?: string;
    }) => {
      const { error } = await supabase.from("readings").insert({
        user_id: user!.id,
        ...reading,
      });
      if (error) throw error;
    },
    onSuccess: invalidateReadings,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Reading> }) => {
      const { error } = await supabase.from("readings").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateReadings,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReadingStatus }) => {
      const completed_at = status === "done" ? new Date().toISOString() : null;
      const { error } = await supabase.from("readings").update({ status, completed_at }).eq("id", id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidateReadings();
      if (status === "done") toast.success("Reading completed! 📚");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("readings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateReadings,
  });

  const createReading: (reading: {
    course_id: string;
    title: string;
    pages?: string;
    due_date?: string;
    flashcard_deck_id?: string;
    task_id?: string;
    exam_id?: string;
  }) => Promise<{ success: boolean; error?: string }> = async (reading) => {
    if (!user) return { success: false, error: "Not authenticated" };
    try {
      await createMutation.mutateAsync(reading);
      toast.success("Reading added!");
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create reading" };
    }
  };

  const updateReading = async (id: string, updates: Partial<Reading>) => {
    try {
      await updateMutation.mutateAsync({ id, updates });
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const updateStatus = async (id: string, status: ReadingStatus) => {
    try {
      await statusMutation.mutateAsync({ id, status });
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const deleteReading = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Reading deleted");
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  return {
    readings: query.data ?? [],
    loading: query.isLoading,
    createReading,
    updateReading,
    updateStatus,
    deleteReading,
    refetch: query.refetch,
  };
}

// Hook for fetching readings for Today/Upcoming view
export function useUpcomingReadings() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: readingKeys.upcoming(user?.id ?? ""),
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("readings")
        .select(`*, course:courses (id, name, short_code, color)`)
        .eq("user_id", user!.id)
        .neq("status", "done")
        .or(`due_date.is.null,due_date.gte.${today}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10);

      if (error) throw error;
      return (data ?? []).map(transformCourse) as Reading[];
    },
    enabled: !!user,
  });

  return { readings: query.data ?? [], loading: query.isLoading, refetch: query.refetch };
}
