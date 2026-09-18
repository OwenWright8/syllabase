import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Exam {
  id: string;
  title: string;
  exam_at: string;
  chapters: string | null;
  topics: string | null;
  course: {
    id: string;
    short_code: string;
    color: string;
    name: string;
  };
}

export const examKeys = {
  all: (userId: string) => ["exams", userId] as const,
};

export interface UpcomingExam {
  id: string;
  title: string;
  exam_at: string;
  course: {
    short_code: string;
    color: string;
  } | null;
}

export function useUpcomingExams() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...examKeys.all(user?.id ?? ""), "upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select(`*, course:courses (short_code, color)`)
        .eq("user_id", user!.id)
        .gte("exam_at", new Date().toISOString())
        .order("exam_at", { ascending: true })
        .limit(5);

      if (error) throw error;
      return (data ?? []) as UpcomingExam[];
    },
    enabled: !!user,
  });
}

export function useExams() {
  const { user } = useAuth();

  return useQuery({
    queryKey: examKeys.all(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select(`*, course:courses (id, short_code, color, name)`)
        .eq("user_id", user!.id)
        .order("exam_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((exam) => ({
        ...exam,
        course: Array.isArray(exam.course) ? exam.course[0] : exam.course,
      })) as Exam[];
    },
    enabled: !!user,
  });
}
