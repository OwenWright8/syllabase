import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { CompactWeekCalendar } from "@/components/today/CompactWeekCalendar";
import { CompactTaskItem } from "@/components/today/CompactTaskItem";
import { QuickStatsBento } from "@/components/today/QuickStatsBento";
import { ActivityHeatmap } from "@/components/today/ActivityHeatmap";
import { ComingUpSection } from "@/components/today/ComingUpSection";
import { BentoEmptyState } from "@/components/today/BentoEmptyState";
import { BentoExamCountdown } from "@/components/today/BentoExamCountdown";
import { FloatingActionButton, QuickAddKind } from "@/components/today/FloatingActionButton";
import { QuickAddDialogs } from "@/components/today/QuickAddDialogs";
import { TaskSection } from "@/components/today/TaskSection";
import { UpcomingReadingsWidget } from "@/components/readings/UpcomingReadingsWidget";
import { UpcomingStudyWidget } from "@/components/study/UpcomingStudyWidget";
import { PlannerItemRow } from "@/components/planner/PlannerItemRow";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, isSameDay, addDays, differenceInHours, subDays } from "date-fns";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimezone, nowInTimezone } from "@/lib/dateUtils";
import { motion, AnimatePresence } from "framer-motion";
import { Sunrise, Sun, Moon, ListChecks } from "lucide-react";
import { TodayTask, useUserTasks, useMarkTaskDone } from "@/hooks/useTasks";
import { useUpcomingExams } from "@/hooks/useExams";
import { useUpcomingQuizzes } from "@/hooks/useQuizzes";
import { useDayPlan, dayPlanTypeLabels } from "@/hooks/useDayPlan";
import { CountdownItem } from "@/components/today/BentoExamCountdown";
import { fadeUp } from "@/lib/motion";

function getGreeting(): { text: string; icon: typeof Sun } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", icon: Sunrise };
  if (hour < 18) return { text: "Good afternoon", icon: Sun };
  return { text: "Good evening", icon: Moon };
}

export default function Today() {
  const { loading } = useUserTimezone();

  // The selected date and week below are derived once, from the timezone, on
  // first render. Waiting for the profile's timezone (instead of starting from
  // the New York default) keeps Today from opening on the wrong day for anyone
  // whose calendar date differs from New York's.
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  return <TodayView />;
}

function TodayView() {
  const { timezone } = useUserTimezone();
  const { data: allTasks = [], isLoading } = useUserTasks();
  const { data: upcomingExams = [] } = useUpcomingExams();
  const { data: upcomingQuizzes = [] } = useUpcomingQuizzes();
  const markTaskDone = useMarkTaskDone();
  const [selectedDate, setSelectedDate] = useState(nowInTimezone(timezone));
  const [weekStart, setWeekStart] = useState(startOfWeek(nowInTimezone(timezone)));
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(null);
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const {
    planEntries,
    addToPlan: dayPlanAddToPlan,
    removeFromPlan: dayPlanRemoveFromPlan,
    moveEntry: dayPlanMoveEntry,
    completeEntry: dayPlanCompleteEntry,
  } = useDayPlan(selectedDateStr);
  const plannedTaskIds = useMemo(
    () => new Set(planEntries.filter((e) => e.kind === "task").map((e) => e.id)),
    [planEntries]
  );

  const countdownItems: CountdownItem[] = useMemo(() => [
    ...upcomingExams.map((e) => ({ id: e.id, kind: "exam" as const, title: e.title, at: e.exam_at, course: e.course })),
    ...upcomingQuizzes.map((q) => ({ id: q.id, kind: "quiz" as const, title: q.title, at: q.quiz_at, course: q.course })),
  ], [upcomingExams, upcomingQuizzes]);

  const isSelectedToday = isSameDay(selectedDate, nowInTimezone(timezone));
  // Quick-add plans for the day being viewed, but only when it is ahead of
  // today: a past day would make a new assignment due in the past.
  const quickAddDate = selectedDateStr > format(nowInTimezone(timezone), "yyyy-MM-dd") ? selectedDateStr : undefined;
  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  const activeTasks = useMemo(() => allTasks.filter((t) => t.status !== "done"), [allTasks]);
  const doneTasks = useMemo(() => allTasks.filter((t) => t.status === "done"), [allTasks]);

  const getUrgency = (task: TodayTask): "overdue" | "due-soon" | "normal" => {
    const now = nowInTimezone(timezone);
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    const taskDueDateStr = formatInTimezone(task.due_at, "yyyy-MM-dd", timezone);

    if (taskDueDateStr < selectedDateStr) return "overdue";

    const hoursUntilDue = differenceInHours(new Date(task.due_at), now);
    if (hoursUntilDue <= 48 && hoursUntilDue > 0) return "due-soon";

    return "normal";
  };

  // Classify active tasks relative to the selected date — mirrors the
  // previous per-date server query, now computed client-side from the one
  // broad tasks query above.
  const dateClassified = useMemo(() => {
    const now = nowInTimezone(timezone);
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    const tomorrowDateStr = format(addDays(selectedDate, 1), "yyyy-MM-dd");
    const threeDaysOut = format(addDays(selectedDate, 3), "yyyy-MM-dd");
    const isToday = isSameDay(selectedDate, now);

    const overdue: TodayTask[] = [];
    const dueOnDate: TodayTask[] = [];
    const scheduledToday: TodayTask[] = [];
    const tomorrow: TodayTask[] = [];
    const upcoming: TodayTask[] = [];

    activeTasks.forEach((task) => {
      const taskDueDateStr = formatInTimezone(task.due_at, "yyyy-MM-dd", timezone);
      const isOverdueTask = taskDueDateStr < selectedDateStr;
      const isDueOnSelectedDate = taskDueDateStr === selectedDateStr;
      const isScheduledForSelectedDate = task.work_date === selectedDateStr;
      const isDueOrScheduledTomorrow = taskDueDateStr === tomorrowDateStr || task.work_date === tomorrowDateStr;
      const isExamPrep = task.type === "exam_prep";
      const isUpcoming = taskDueDateStr > selectedDateStr && taskDueDateStr <= threeDaysOut;

      if (isUpcoming) {
        upcoming.push(task);
      }

      if (isOverdueTask && isToday && !isExamPrep) {
        overdue.push(task);
      } else if (isDueOnSelectedDate && !isOverdueTask && !isExamPrep) {
        dueOnDate.push(task);
      } else if (isScheduledForSelectedDate && (!isDueOnSelectedDate || isExamPrep) && !isOverdueTask) {
        scheduledToday.push(task);
      } else if (isDueOrScheduledTomorrow && isToday && !isOverdueTask) {
        tomorrow.push(task);
      }
    });

    return { overdue, dueOnDate, scheduledToday, tomorrow, upcoming };
  }, [activeTasks, selectedDate, timezone]);

  const groupedTasks = useMemo(() => {
    // Tasks already sitting in the ordered Plan section (below) are shown
    // there instead — showing them again here would just be a duplicate.
    const allSelected = [...dateClassified.overdue, ...dateClassified.dueOnDate, ...dateClassified.scheduledToday]
      .filter((task) => !plannedTaskIds.has(task.id));

    const dueSoon: TodayTask[] = [];
    const later: TodayTask[] = [];

    allSelected.forEach((task) => {
      const urgency = getUrgency(task);
      if (urgency === "overdue" || urgency === "due-soon") {
        dueSoon.push(task);
      } else {
        later.push(task);
      }
    });

    return { dueSoon, later };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateClassified, selectedDate, timezone, plannedTaskIds]);

  // When the user has an explicit ordered plan for the date, that ordering
  // *is* the recommendation — no need for a separate "recommended" badge
  // elsewhere.
  const recommendedTaskId = useMemo(() => {
    if (planEntries.length > 0) return null;
    if (groupedTasks.dueSoon.length > 0) return groupedTasks.dueSoon[0].id;
    if (groupedTasks.later.length > 0) return groupedTasks.later[0].id;
    return null;
  }, [groupedTasks, planEntries]);

  // Week calendar dot counts — per work_date/due_date, across all active tasks.
  const taskCounts = useMemo(() => {
    const now = nowInTimezone(timezone);
    const todayStr = format(now, "yyyy-MM-dd");
    const counts: Record<string, { total: number; overdue: number }> = {};

    activeTasks.forEach((task) => {
      const workDate = task.work_date;
      const taskDueDateStr = formatInTimezone(task.due_at, "yyyy-MM-dd", timezone);
      const isOverdue = taskDueDateStr < todayStr;

      if (workDate) {
        if (!counts[workDate]) counts[workDate] = { total: 0, overdue: 0 };
        counts[workDate].total++;
        if (isOverdue) counts[workDate].overdue++;
      }

      if (!counts[taskDueDateStr]) counts[taskDueDateStr] = { total: 0, overdue: 0 };
      if (!workDate || workDate !== taskDueDateStr) {
        counts[taskDueDateStr].total++;
        if (isOverdue) counts[taskDueDateStr].overdue++;
      }
    });

    return counts;
  }, [activeTasks, timezone]);

  // 7-day completion chart.
  const completedByDay = useMemo(() => {
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
    const byDay: Record<string, number> = {};

    doneTasks.forEach((task) => {
      if (task.completed_at && task.completed_at >= sevenDaysAgo) {
        const dateStr = formatInTimezone(task.completed_at, "yyyy-MM-dd", timezone);
        byDay[dateStr] = (byDay[dateStr] || 0) + 1;
      }
    });

    return byDay;
  }, [doneTasks, timezone]);

  const termCompleted = doneTasks.length;

  const stats = useMemo(() => {
    const now = nowInTimezone(timezone);
    const todayStr = format(now, "yyyy-MM-dd");
    const weekStartStr = format(startOfWeek(now), "yyyy-MM-dd");
    const weekEndStr = format(endOfWeek(now), "yyyy-MM-dd");

    let tasksForToday = 0;
    let overdueTotal = 0;

    activeTasks.forEach((task) => {
      const taskDueDateStr = formatInTimezone(task.due_at, "yyyy-MM-dd", timezone);
      const isOverdue = taskDueDateStr < todayStr;
      const isDueToday = taskDueDateStr === todayStr;
      const isWorkToday = task.work_date === todayStr;

      if (isOverdue || isDueToday || isWorkToday) tasksForToday++;
      if (isOverdue) overdueTotal++;
    });

    const completedToday = doneTasks.filter((task) => {
      if (!task.completed_at) return false;
      return formatInTimezone(task.completed_at, "yyyy-MM-dd", timezone) === todayStr;
    }).length;

    const weekTasks = allTasks.filter((t) => t.work_date && t.work_date >= weekStartStr && t.work_date <= weekEndStr);
    const weekCompleted = weekTasks.filter((t) => t.status === "done").length;
    const weekTotal = weekTasks.length;

    return { tasksForToday, completedToday, overdueTotal, weekCompleted, weekTotal };
  }, [activeTasks, doneTasks, allTasks, timezone]);

  const handleSelectDate = (date: Date) => setSelectedDate(date);
  const handlePreviousWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() - 7);
    setWeekStart(newWeekStart);
  };
  const handleNextWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() + 7);
    setWeekStart(newWeekStart);
  };

  const completeTask = async (taskId: string) => {
    try {
      await markTaskDone.mutateAsync(taskId);
      toast.success("Task completed!");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const addTaskToTodayPlan = (taskId: string) => {
    const task = activeTasks.find((t) => t.id === taskId);
    if (!task) return;
    dayPlanAddToPlan({
      uid: `task-${task.id}`,
      kind: "task",
      id: task.id,
      title: task.title,
      status: task.status,
      order: null,
      scheduledDate: task.work_date || null,
      course: task.course,
    });
  };

  const hasTodayWork =
    planEntries.length > 0 ||
    dateClassified.overdue.length > 0 || dateClassified.dueOnDate.length > 0 || dateClassified.scheduledToday.length > 0;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 pb-24">
        {/* Week Calendar */}
        <CompactWeekCalendar
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          weekStart={weekStart}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          taskCounts={taskCounts}
        />

        {/* Header */}
        <AnimatePresence mode="wait">
          <motion.div
            key={format(selectedDate, "yyyy-MM-dd")}
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit="exit"
            className="mt-8 mb-6"
          >
            <div className="flex flex-col gap-1">
              {isSelectedToday && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GreetingIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{greeting.text}</span>
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                {isSelectedToday ? "Today" : format(selectedDate, "EEEE")}
                <span className="text-muted-foreground font-normal ml-2 text-xl sm:text-2xl">
                  {format(selectedDate, "MMMM d")}
                </span>
              </h1>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Stats strip */}
        {isSelectedToday && (
          <div className="mb-8">
            <QuickStatsBento
              completedToday={stats.completedToday}
              totalToday={stats.tasksForToday}
              overdueCount={stats.overdueTotal}
              weekCompleted={stats.weekCompleted}
              weekTotal={stats.weekTotal}
              termCompleted={termCompleted}
            />
          </div>
        )}

        {/* Calm, linear layout: single focus column + a slim sidebar */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main column */}
          <div className="flex-1 min-w-0 space-y-5 order-2 lg:order-1">
            {!hasTodayWork ? (
              <BentoEmptyState />
            ) : (
              <>
                {planEntries.length > 0 && (
                  <TaskSection title="Your Plan" count={planEntries.length} variant="default">
                    <div className="p-1.5 space-y-1.5">
                      {planEntries.map((entry, index) => (
                        <PlannerItemRow
                          key={entry.uid}
                          title={entry.title}
                          typeLabel={dayPlanTypeLabels[entry.kind]}
                          course={entry.course}
                          mode="plan"
                          onComplete={() => dayPlanCompleteEntry(entry)}
                          onRemove={() => dayPlanRemoveFromPlan(entry)}
                          onMoveUp={() => dayPlanMoveEntry(index, -1)}
                          onMoveDown={() => dayPlanMoveEntry(index, 1)}
                          canMoveUp={index > 0}
                          canMoveDown={index < planEntries.length - 1}
                        />
                      ))}
                    </div>
                  </TaskSection>
                )}

                {groupedTasks.dueSoon.length > 0 && (
                  <TaskSection
                    title="Due Soon"
                    count={groupedTasks.dueSoon.length}
                    variant={dateClassified.overdue.length > 0 ? "overdue" : "due-soon"}
                  >
                    {groupedTasks.dueSoon.map((task, index) => (
                      <CompactTaskItem
                        key={task.id}
                        task={task}
                        timezone={timezone}
                        urgency={getUrgency(task)}
                        onComplete={completeTask}
                        onAddToPlan={addTaskToTodayPlan}
                        isRecommended={task.id === recommendedTaskId && index === 0}
                      />
                    ))}
                  </TaskSection>
                )}

                {groupedTasks.later.length > 0 && (
                  <TaskSection
                    title="Later"
                    count={groupedTasks.later.length}
                    variant="muted"
                  >
                    {groupedTasks.later.map((task, index) => (
                      <CompactTaskItem
                        key={task.id}
                        task={task}
                        timezone={timezone}
                        urgency="normal"
                        onComplete={completeTask}
                        onAddToPlan={addTaskToTodayPlan}
                        isRecommended={groupedTasks.dueSoon.length === 0 && task.id === recommendedTaskId && index === 0}
                      />
                    ))}
                  </TaskSection>
                )}
              </>
            )}

            {/* Readings Widget */}
            {isSelectedToday && <UpcomingReadingsWidget maxItems={3} />}
          </div>

          {/* Slim sidebar */}
          <div className="w-full lg:w-[300px] shrink-0 space-y-5 order-1 lg:order-2">
            <BentoExamCountdown items={countdownItems} />

            {isSelectedToday && <UpcomingStudyWidget maxItems={3} />}

            {isSelectedToday && (
              <ActivityHeatmap completedByDay={completedByDay} dailyGoal={5} />
            )}

            <ComingUpSection
              tasks={dateClassified.upcoming}
              timezone={timezone}
            />
          </div>
        </div>

        {/* Quick add: the "+" menu opens the create form right here */}
        <FloatingActionButton onSelect={setQuickAdd} />
        <QuickAddDialogs active={quickAdd} onClose={() => setQuickAdd(null)} defaultDate={quickAddDate} />
      </div>
    </Layout>
  );
}
