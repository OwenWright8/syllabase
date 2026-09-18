import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Quiz {
  id: string;
  title: string;
  quiz_at: string;
  topics: string | null;
  course: {
    id: string;
    short_code: string;
    color: string;
    name: string;
  };
}

export const quizKeys = {
  all: (userId: string) => ["quizzes", userId] as const,
};

export interface UpcomingQuiz {
  id: string;
  title: string;
  quiz_at: string;
  course: {
    short_code: string;
    color: string;
  } | null;
}

export function useUpcomingQuizzes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...quizKeys.all(user?.id ?? ""), "upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select(`*, course:courses (short_code, color)`)
        .eq("user_id", user!.id)
        .gte("quiz_at", new Date().toISOString())
        .order("quiz_at", { ascending: true })
        .limit(5);

      if (error) throw error;
      return (data ?? []) as UpcomingQuiz[];
    },
    enabled: !!user,
  });
}

export function useQuizzes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: quizKeys.all(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select(`*, course:courses (id, short_code, color, name)`)
        .eq("user_id", user!.id)
        .order("quiz_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((quiz) => ({
        ...quiz,
        course: Array.isArray(quiz.course) ? quiz.course[0] : quiz.course,
      })) as Quiz[];
    },
    enabled: !!user,
  });
}
