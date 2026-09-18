import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Course {
  id: string;
  name: string;
  short_code: string;
  color: string;
  semester: string | null;
  is_archived: boolean;
}

export const courseKeys = {
  // Broad prefix — invalidating this also covers detail(userId, courseId),
  // since react-query matches query keys by prefix.
  all: (userId: string) => ["courses", userId] as const,
  detail: (userId: string, courseId: string) => ["courses", userId, "detail", courseId] as const,
};

export function useCourse(courseId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: courseKeys.detail(user?.id ?? "", courseId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId!)
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data as Course;
    },
    enabled: !!user && !!courseId,
  });
}

export function useCourses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: courseKeys.all(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("user_id", user!.id)
        .order("name");

      if (error) throw error;
      return (data ?? []) as Course[];
    },
    enabled: !!user,
  });
}

export interface NewCourse {
  name: string;
  short_code: string;
  color: string;
  semester: string | null;
}

export function useCreateCourse() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (course: NewCourse) => {
      const { error } = await supabase.from("courses").insert({
        user_id: user!.id,
        ...course,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.all(user!.id) });
    },
  });
}

export function useToggleCourseArchive() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, archive }: { courseId: string; archive: boolean }) => {
      const { error } = await supabase
        .from("courses")
        .update({ is_archived: archive })
        .eq("id", courseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.all(user!.id) });
    },
  });
}
