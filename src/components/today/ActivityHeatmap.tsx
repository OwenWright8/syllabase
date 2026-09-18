import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Flame, Target } from "lucide-react";
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion";

interface ActivityHeatmapProps {
  completedByDay: Record<string, number>;
  dailyGoal?: number;
  className?: string;
}

export function ActivityHeatmap({ completedByDay, dailyGoal = 5, className }: ActivityHeatmapProps) {
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const count = completedByDay[dateStr] || 0;
      return {
        date,
        dateStr,
        count,
        dayLabel: format(date, "EEE"),
        isToday: i === 6,
      };
    });
  }, [completedByDay]);

  const maxCount = Math.max(...days.map(d => d.count), dailyGoal, 1);
  const chartHeight = 48;
  const goalLineY = chartHeight - (dailyGoal / maxCount) * chartHeight;

  const getIntensity = (count: number) => {
    if (count === 0) return 0;
    const ratio = count / maxCount;
    if (ratio >= 0.8) return 4;
    if (ratio >= 0.6) return 3;
    if (ratio >= 0.3) return 2;
    return 1;
  };

  const totalWeek = days.reduce((sum, d) => sum + d.count, 0);
  const streak = useMemo(() => {
    let count = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) count++;
      else break;
    }
    return count;
  }, [days]);

  const daysHitGoal = days.filter(d => d.count >= dailyGoal).length;

  return (
    <div className={cn("glass-strong rounded-2xl p-5 space-y-3", className)}>
      {/* Header with streak */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          7-Day Activity
        </span>
        {streak >= 2 && (
          <motion.div 
            className="flex items-center gap-1 text-[11px] font-semibold text-warning"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={SPRING_SNAPPY}
          >
            <Flame className="h-3.5 w-3.5" />
            {streak}d streak
          </motion.div>
        )}
      </div>

      {/* Chart area with goal line */}
      <div className="relative pt-5" style={{ height: chartHeight + 20 }}>
        {/* Daily Goal Line */}
        <div 
          className="absolute left-0 right-0 flex items-center gap-2 z-10"
          style={{ top: goalLineY + 16 }}
        >
          <div className="flex-1 border-t-2 border-dashed border-success/40" />
          <span className="text-[9px] font-medium text-success/70 flex items-center gap-1 bg-card/80 px-1.5 py-0.5 rounded">
            <Target className="h-2.5 w-2.5" />
            Goal: {dailyGoal}
          </span>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-2 h-full relative z-20">
          {days.map((day, i) => {
            const intensity = getIntensity(day.count);
            const barHeight = day.count === 0 ? 6 : Math.max(8, (day.count / maxCount) * chartHeight);
            const hitGoal = day.count >= dailyGoal;
            
            return (
              <motion.div
                key={day.dateStr}
                className="flex-1 flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease: EASE_OUT }}
              >
                {/* Count label */}
                {day.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-medium",
                    hitGoal ? "text-success" : "text-foreground/70"
                  )}>
                    {day.count}
                  </span>
                )}
                
                {/* Bar */}
                <motion.div 
                  className={cn(
                    "w-full rounded-sm transition-all duration-300",
                    intensity === 0 && "bg-muted/30",
                    intensity === 1 && "bg-primary/25",
                    intensity === 2 && "bg-primary/45",
                    intensity === 3 && "bg-primary/65",
                    intensity === 4 && "bg-primary/90",
                    hitGoal && "ring-1 ring-success/50"
                  )}
                  initial={{ height: 0 }}
                  animate={{ height: barHeight }}
                  transition={{ duration: 0.45, delay: i * 0.04, ease: EASE_OUT }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Day labels */}
      <div className="flex gap-2">
        {days.map((day) => (
          <div key={day.dateStr} className="flex-1 text-center">
            <span className={cn(
              "text-[10px]",
              day.isToday ? "font-semibold text-primary" : "text-muted-foreground"
            )}>
              {day.isToday ? "Today" : day.dayLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
        <span>
          <span className="font-semibold text-foreground">{totalWeek}</span> completed
        </span>
        <span>
          <span className="font-semibold text-success">{daysHitGoal}/7</span> days hit goal
        </span>
      </div>
    </div>
  );
}
