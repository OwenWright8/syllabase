import { format, startOfWeek, addDays, isSameDay, isToday, isPast, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WeeklyCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  taskCounts: Record<string, { total: number; overdue: number }>;
}

export function WeeklyCalendar({
  selectedDate,
  onSelectDate,
  weekStart,
  onPreviousWeek,
  onNextWeek,
  taskCounts,
}: WeeklyCalendarProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const now = new Date();

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-semibold">
          {format(weekStart, "MMMM yyyy")}
        </h2>
        <div className="flex gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onPreviousWeek}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNextWeek}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[560px] sm:min-w-0">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const counts = taskCounts[dateKey] || { total: 0, overdue: 0 };
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isToday(day);
            const isDayPast = isPast(startOfDay(day)) && !isDayToday;
            const hasOverdue = counts.overdue > 0 && (isDayToday || isDayPast);

            return (
              <button
                key={dateKey}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg border-2 transition-all hover:border-primary/50 min-w-[75px] sm:min-w-0",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
                  isDayToday && !isSelected && "border-primary/30"
                )}
              >
                <div className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-0.5 sm:mb-1 uppercase">
                  {format(day, "EEE")}
                </div>
                <div
                  className={cn(
                    "text-base sm:text-lg font-semibold mb-0.5 sm:mb-1",
                    isDayToday && "text-primary"
                  )}
                >
                  {format(day, "d")}
                </div>
                
                {counts.total > 0 && (
                  <Badge
                    variant={hasOverdue ? "destructive" : "secondary"}
                    className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0"
                  >
                    {counts.total}
                  </Badge>
                )}
                
                {hasOverdue && (
                  <AlertCircle className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
