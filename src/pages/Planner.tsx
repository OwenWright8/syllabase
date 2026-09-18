import { useState } from "react";
import { Layout } from "@/components/Layout";
import { CompactWeekCalendar } from "@/components/today/CompactWeekCalendar";
import { PlannerItemRow } from "@/components/planner/PlannerItemRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDayPlan, dayPlanTypeLabels, DayPlanKind } from "@/hooks/useDayPlan";
import { format, isToday, startOfWeek } from "date-fns";
import { CalendarRange, CheckSquare, FileText, BrainCircuit, ListChecks } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp } from "@/lib/motion";

export default function Planner() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const { isLoading, planEntries, poolByKind, dateCounts, addToPlan, removeFromPlan, moveEntry, completeEntry } =
    useDayPlan(selectedDateStr);

  const handlePreviousWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const handleNextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const scheduledLabelFor = (scheduledDate: string | null): string | null => {
    if (!scheduledDate || scheduledDate === selectedDateStr) return null;
    try {
      const d = new Date(`${scheduledDate}T00:00:00`);
      return `Planned ${format(d, "MMM d")}`;
    } catch {
      return null;
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  // Short labels — this is a 3-up tab strip inside a compact card, so
  // "Assignments" (the term used everywhere else in the app) truncates
  // illegibly on narrow screens.
  const poolTabConfig: { key: DayPlanKind; label: string; icon: typeof CheckSquare }[] = [
    { key: "task", label: "Tasks", icon: CheckSquare },
    { key: "reading", label: "Readings", icon: FileText },
    { key: "study", label: "Study", icon: BrainCircuit },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Plan Your Day
          </h1>
          <p className="text-muted-foreground mt-1">
            Pick what you want to get done, and put it in the order you'll do it
          </p>
        </div>

        {/* Date picker */}
        <CompactWeekCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          weekStart={weekStart}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          taskCounts={dateCounts}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedDateStr}
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit="exit"
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Today's Plan */}
            <div className="glass-strong rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <ListChecks className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {isToday(selectedDate) ? "Today's Plan" : `${format(selectedDate, "EEEE")}'s Plan`}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {format(selectedDate, "EEEE, MMMM d")} · {planEntries.length} item{planEntries.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {planEntries.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CalendarRange className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nothing planned yet</p>
                  <p className="text-xs mt-1">Add items from the pool on the right, then order them below</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {planEntries.map((entry, index) => (
                    <PlannerItemRow
                      key={entry.uid}
                      title={entry.title}
                      typeLabel={dayPlanTypeLabels[entry.kind]}
                      course={entry.course}
                      mode="plan"
                      onComplete={() => completeEntry(entry)}
                      onRemove={() => removeFromPlan(entry)}
                      onMoveUp={() => moveEntry(index, -1)}
                      onMoveDown={() => moveEntry(index, 1)}
                      canMoveUp={index > 0}
                      canMoveDown={index < planEntries.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pool */}
            <div className="glass-strong rounded-2xl p-4 sm:p-5">
              <Tabs defaultValue="task">
                <TabsList className="grid w-full grid-cols-3">
                  {poolTabConfig.map(({ key, label, icon: Icon }) => (
                    <TabsTrigger key={key} value={key} className="gap-1.5 text-[11px] sm:text-sm">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                      {poolByKind[key].length > 0 && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                          {poolByKind[key].length}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {poolTabConfig.map(({ key }) => (
                  <TabsContent key={key} value={key} className="mt-3 space-y-2 max-h-[520px] overflow-y-auto">
                    {poolByKind[key].length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">
                        Nothing here — you're all caught up
                      </div>
                    ) : (
                      poolByKind[key].map((entry) => (
                        <PlannerItemRow
                          key={entry.uid}
                          title={entry.title}
                          typeLabel={dayPlanTypeLabels[entry.kind]}
                          course={entry.course}
                          mode="pool"
                          scheduledLabel={scheduledLabelFor(entry.scheduledDate)}
                          onAdd={() => addToPlan(entry)}
                        />
                      ))
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Layout>
  );
}
