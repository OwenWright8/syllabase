import { format, addDays, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";

interface CompactWeekCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  taskCounts: Record<string, { total: number; overdue: number }>;
}

export function CompactWeekCalendar({
  selectedDate,
  onSelectDate,
  weekStart,
  onPreviousWeek,
  onNextWeek,
  taskCounts,
}: CompactWeekCalendarProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="glass rounded-2xl p-3 shadow-soft-md">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Previous week"
          variant="ghost"
          size="icon"
          onClick={onPreviousWeek}
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 flex gap-1.5 justify-center">
          <AnimatePresence mode="popLayout">
            {days.map((day, index) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const counts = taskCounts[dateKey] || { total: 0, overdue: 0 };
              const isSelected = isSameDay(day, selectedDate);
              const isDayToday = isToday(day);
              const hasOverdue = counts.overdue > 0;
              const hasTasks = counts.total > 0;

              return (
                <motion.button
                  key={dateKey}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18, delay: index * 0.02, ease: EASE_OUT }}
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-2 px-2.5 sm:py-2.5 sm:px-3.5 rounded-xl transition-smooth",
                    "min-w-[44px] sm:min-w-[52px]",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isDayToday
                      ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "text-[10px] sm:text-xs font-medium uppercase tracking-wide",
                    isSelected ? "text-primary-foreground/80" : "opacity-60"
                  )}>
                    {format(day, "EEE").slice(0, 2)}
                  </span>
                  <span className={cn(
                    "text-base sm:text-lg font-bold leading-tight",
                    isDayToday && !isSelected && "text-primary"
                  )}>
                    {format(day, "d")}
                  </span>

                  {/* Task indicator dots — reserved space on every day so pills stay the same height */}
                  <div className="mt-1 h-1.5 flex items-center justify-center gap-0.5">
                    {hasTasks && (
                      <>
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full transition-colors",
                            hasOverdue
                              ? "bg-destructive"
                              : isSelected
                              ? "bg-primary-foreground/70"
                              : "bg-primary/50"
                          )}
                        />
                        {counts.total > 2 && (
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full transition-colors",
                              isSelected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"
                            )}
                          />
                        )}
                      </>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <Button
          aria-label="Next week"
          variant="ghost"
          size="icon"
          onClick={onNextWeek}
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
