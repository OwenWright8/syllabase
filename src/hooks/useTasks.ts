import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  due_at: string;
  work_date: string;
  status: string;
  course_id: string | null;
  estimated_minutes: number;
  priority: string;
  course: {
    id: string;
    name: string;
    short_code: string;
    color: string;
  } | null;
}

export const taskKeys = {
  all: (userId: string) => ["tasks", userId] as const,
};

/**
 * Active (not-done), non-reading tasks for the assignments list — excludes
 * tasks whose course has been archived.
 */
export function useTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...taskKeys.all(user?.id ?? ""), "active-non-reading"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`*, course:courses (id, name, short_code, color, is_archived)`)
        .eq("user_id", user!.id)
        .neq("status", "done")
        .neq("type", "reading")
        .order("due_at", { ascending: true });

      if (error) throw error;
      return ((data ?? []) as (Task & { course: (Task["course"] & { is_archived: boolean }) | null })[])
        .filter((task) => !task.course?.is_archived);
    },
    enabled: !!user,
  });
}

export interface TodayTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  due_at: string;
  work_date: string;
  plan_order: number | null;
  status: string;
  completed_at: string | null;
  estimated_minutes?: number | null;
  course: {
    short_code: string;
    color: string;
  } | null;
}

/**
 * Every task for the current user (active + done, all time), course-archived
 * ones excluded. The Today page derives everything it needs — per-date
 * grouping, the week calendar's dot counts, the 7-day activity chart, term
 * totals, and today/this-week stats — from this single query client-side,
 * rather than issuing 5+ separate requests that all read the same table.
 */
export function useUserTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...taskKeys.all(user?.id ?? ""), "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`*, course:courses (short_code, color, is_archived)`)
        .eq("user_id", user!.id)
        .order("due_at", { ascending: true });

      if (error) throw error;
      return ((data ?? []) as (TodayTask & { course: (TodayTask["course"] & { is_archived: boolean }) | null })[])
        .filter((task) => !task.course?.is_archived);
    },
    enabled: !!user,
  });
}

export interface CourseTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  due_at: string;
  work_date: string;
  status: string;
  course: {
    short_code: string;
    color: string;
  } | null;
}

/** Active (not-done) tasks for a single course, shown on the course detail page. */
export function useCourseTasks(courseId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...taskKeys.all(user?.id ?? ""), "course", courseId ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`*, course:courses (short_code, color)`)
        .eq("user_id", user!.id)
        .eq("course_id", courseId!)
        .neq("status", "done")
        .order("due_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as CourseTask[];
    },
    enabled: !!user && !!courseId,
  });
}

export interface ReadingTask {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  course_id: string | null;
  course: {
    id: string;
    name: string;
    short_code: string;
    color: string;
  } | null;
}

/** Tasks of type "reading" — shown alongside standalone readings on the Readings page. */
export function useReadingTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...taskKeys.all(user?.id ?? ""), "reading-type"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`*, course:courses (id, name, short_code, color, is_archived)`)
        .eq("user_id", user!.id)
        .eq("type", "reading")
        .order("due_at", { ascending: true });

      if (error) throw error;
      return ((data ?? []) as (ReadingTask & { course: (ReadingTask["course"] & { is_archived: boolean }) | null })[])
        .filter((task) => !task.course?.is_archived);
    },
    enabled: !!user,
  });
}

export function useUpdateTaskStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const completed_at = status === "done" ? new Date().toISOString() : null;
      const { error } = await supabase.from("tasks").update({ status, completed_at }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: taskKeys.all(user.id) });
    },
  });
}

export function useMarkTaskDone() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        // completed_at is a timestamptz, so store the real instant. (nowInTimezone()
        // returns a Date whose *local fields* are shifted to the profile timezone;
        // serializing that skewed the stored time by the browser/profile offset.)
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: taskKeys.all(user.id) });
    },
  });
}

/** Sets/clears a task's day-planner scheduling — work_date + its order within that day's plan. */
export function useUpdateTaskPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      workDate,
      planOrder,
    }: {
      taskId: string;
      workDate: string | null;
      planOrder: number | null;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ work_date: workDate, plan_order: planOrder })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: taskKeys.all(user.id) });
    },
  });
}
