import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type StudyItemStatus = "not_started" | "in_progress" | "done";
export type StudyItemPriority = "low" | "medium" | "high";

export interface StudyItem {
  id: string;
  user_id: string;
  course_id: string | null;
  exam_id: string | null;
  quiz_id: string | null;
  title: string;
  notes: string | null;
  status: StudyItemStatus;
  priority: StudyItemPriority;
  completed_at: string | null;
  planned_date: string | null;
  plan_order: number | null;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    name: string;
    short_code: string;
    color: string;
  } | null;
  exam?: {
    id: string;
    title: string;
    exam_at: string;
  } | null;
  quiz?: {
    id: string;
    title: string;
    quiz_at: string;
  } | null;
}

export const studyItemKeys = {
  all: (userId: string) => ["study-items", userId] as const,
};

function transformRelations<T extends { course: unknown; exam: unknown; quiz: unknown }>(row: T) {
  return {
    ...row,
    course: Array.isArray(row.course) ? row.course[0] : row.course,
    exam: Array.isArray(row.exam) ? row.exam[0] : row.exam,
    quiz: Array.isArray(row.quiz) ? row.quiz[0] : row.quiz,
  };
}

export function useStudyItems() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: studyItemKeys.all(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_items")
        .select(`*, course:courses (id, name, short_code, color), exam:exams (id, title, exam_at), quiz:quizzes (id, title, quiz_at)`)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(transformRelations) as StudyItem[];
    },
    enabled: !!user,
  });

  const invalidate = () => {
    if (user) queryClient.invalidateQueries({ queryKey: studyItemKeys.all(user.id) });
  };

  const createMutation = useMutation({
    mutationFn: async (item: {
      title: string;
      course_id?: string | null;
      exam_id?: string | null;
      quiz_id?: string | null;
      notes?: string | null;
      priority?: StudyItemPriority;
    }) => {
      const { error } = await supabase.from("study_items").insert({
        user_id: user!.id,
        ...item,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<StudyItem> }) => {
      const { error } = await supabase.from("study_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StudyItemStatus }) => {
      const completed_at = status === "done" ? new Date().toISOString() : null;
      const { error } = await supabase.from("study_items").update({ status, completed_at }).eq("id", id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      if (status === "done") toast.success("Study item completed! 🧠");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("study_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createStudyItem = async (item: {
    title: string;
    course_id?: string | null;
    exam_id?: string | null;
    quiz_id?: string | null;
    notes?: string | null;
    priority?: StudyItemPriority;
  }) => {
    if (!user) return { success: false, error: "Not authenticated" };
    try {
      await createMutation.mutateAsync(item);
      toast.success("Study item added!");
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to add study item" };
    }
  };

  const updateStudyItem = async (id: string, updates: Partial<StudyItem>) => {
    try {
      await updateMutation.mutateAsync({ id, updates });
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const updateStatus = async (id: string, status: StudyItemStatus) => {
    try {
      await statusMutation.mutateAsync({ id, status });
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const deleteStudyItem = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Study item deleted");
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  return {
    studyItems: query.data ?? [],
    loading: query.isLoading,
    createStudyItem,
    updateStudyItem,
    updateStatus,
    deleteStudyItem,
    refetch: query.refetch,
  };
}
