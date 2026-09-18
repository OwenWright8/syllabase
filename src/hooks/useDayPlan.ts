import { useMemo } from "react";
import { toast } from "sonner";
import { useUserTasks, useMarkTaskDone, useUpdateTaskPlan } from "@/hooks/useTasks";
import { useReadings, Reading } from "@/hooks/useReadings";
import { useStudyItems, StudyItem } from "@/hooks/useStudyItems";

export type DayPlanKind = "task" | "reading" | "study";

export interface DayPlanEntry {
  uid: string;
  kind: DayPlanKind;
  id: string;
  title: string;
  status: string;
  order: number | null;
  scheduledDate: string | null;
  course: { short_code: string; color: string } | null;
}

export const dayPlanTypeLabels: Record<DayPlanKind, string> = {
  task: "Assignment",
  reading: "Reading",
  study: "Study",
};

/**
 * Shared day-planner logic: combines tasks/readings/study items into one
 * ordered list per date (via work_date/planned_date + plan_order), and
 * exposes the mutations to add/remove/reorder/complete entries. Backs both
 * the Planner page (browse any date, pull from pools) and the Today page
 * (live view + reorder of just the selected date's plan), so the two never
 * drift apart.
 */
export function useDayPlan(selectedDateStr: string) {
  const { data: tasks = [], isLoading: tasksLoading } = useUserTasks();
  const { readings, updateReading, updateStatus: updateReadingStatus, loading: readingsLoading } = useReadings();
  const { studyItems, updateStudyItem, updateStatus: updateStudyStatus, loading: studyLoading } = useStudyItems();
  const markTaskDone = useMarkTaskDone();
  const updateTaskPlan = useUpdateTaskPlan();

  const isLoading = tasksLoading || readingsLoading || studyLoading;

  const allEntries = useMemo<DayPlanEntry[]>(() => {
    const taskEntries: DayPlanEntry[] = tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({
        uid: `task-${t.id}`,
        kind: "task" as const,
        id: t.id,
        title: t.title,
        status: t.status,
        order: t.plan_order,
        scheduledDate: t.work_date || null,
        course: t.course,
      }));

    const readingEntries: DayPlanEntry[] = readings
      .filter((r) => r.status !== "done")
      .map((r) => ({
        uid: `reading-${r.id}`,
        kind: "reading" as const,
        id: r.id,
        title: r.title,
        status: r.status,
        order: r.plan_order,
        scheduledDate: r.planned_date,
        course: r.course ? { short_code: r.course.short_code, color: r.course.color } : null,
      }));

    const studyEntries: DayPlanEntry[] = studyItems
      .filter((s) => s.status !== "done")
      .map((s) => ({
        uid: `study-${s.id}`,
        kind: "study" as const,
        id: s.id,
        title: s.title,
        status: s.status,
        order: s.plan_order,
        scheduledDate: s.planned_date,
        course: s.course ? { short_code: s.course.short_code, color: s.course.color } : null,
      }));

    return [...taskEntries, ...readingEntries, ...studyEntries];
  }, [tasks, readings, studyItems]);

  const planEntries = useMemo(
    () =>
      allEntries
        .filter((e) => e.scheduledDate === selectedDateStr)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [allEntries, selectedDateStr]
  );

  const poolByKind = useMemo(() => {
    const pool = allEntries.filter((e) => e.scheduledDate !== selectedDateStr);
    return {
      task: pool.filter((e) => e.kind === "task"),
      reading: pool.filter((e) => e.kind === "reading"),
      study: pool.filter((e) => e.kind === "study"),
    };
  }, [allEntries, selectedDateStr]);

  // Dot indicators on week strips — total planned items per date, across all three kinds.
  const dateCounts = useMemo(() => {
    const counts: Record<string, { total: number; overdue: number }> = {};
    allEntries.forEach((e) => {
      if (!e.scheduledDate) return;
      if (!counts[e.scheduledDate]) counts[e.scheduledDate] = { total: 0, overdue: 0 };
      counts[e.scheduledDate].total++;
    });
    return counts;
  }, [allEntries]);

  const persistOrder = async (entry: DayPlanEntry, scheduledDate: string | null, order: number | null) => {
    if (entry.kind === "task") {
      await updateTaskPlan.mutateAsync({ taskId: entry.id, workDate: scheduledDate, planOrder: order });
    } else if (entry.kind === "reading") {
      await updateReading(entry.id, { planned_date: scheduledDate, plan_order: order } as Partial<Reading>);
    } else {
      await updateStudyItem(entry.id, { planned_date: scheduledDate, plan_order: order } as Partial<StudyItem>);
    }
  };

  const addToPlan = async (entry: DayPlanEntry, targetDateStr: string = selectedDateStr) => {
    const target = targetDateStr === selectedDateStr ? planEntries : allEntries.filter((e) => e.scheduledDate === targetDateStr);
    const maxOrder = target.reduce((max, e) => Math.max(max, e.order ?? 0), -1);
    try {
      await persistOrder(entry, targetDateStr, maxOrder + 1);
    } catch {
      toast.error("Couldn't add that to the plan");
    }
  };

  const removeFromPlan = async (entry: DayPlanEntry) => {
    try {
      await persistOrder(entry, null, null);
    } catch {
      toast.error("Couldn't remove that from the plan");
    }
  };

  const moveEntry = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= planEntries.length) return;
    const a = planEntries[index];
    const b = planEntries[targetIndex];
    const aOrder = a.order ?? index;
    const bOrder = b.order ?? targetIndex;
    try {
      await Promise.all([
        persistOrder(a, a.scheduledDate, bOrder),
        persistOrder(b, b.scheduledDate, aOrder),
      ]);
    } catch {
      toast.error("Couldn't reorder your plan");
    }
  };

  const completeEntry = async (entry: DayPlanEntry) => {
    try {
      if (entry.kind === "task") {
        await markTaskDone.mutateAsync(entry.id);
      } else if (entry.kind === "reading") {
        await updateReadingStatus(entry.id, "done");
      } else {
        await updateStudyStatus(entry.id, "done");
      }
      toast.success("Nice work — checked off!");
    } catch {
      // Surfaced by the global mutation error handler / hook-level toast.
    }
  };

  return {
    isLoading,
    allEntries,
    planEntries,
    poolByKind,
    dateCounts,
    addToPlan,
    removeFromPlan,
    moveEntry,
    completeEntry,
  };
}
