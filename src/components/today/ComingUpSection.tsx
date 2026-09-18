import { useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { motion } from "framer-motion";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTimezone } from "@/lib/dateUtils";
import { EASE_OUT } from "@/lib/motion";

interface Task {
  id: string;
  title: string;
  due_at: string;
  type: string;
  course: {
    short_code: string;
    color: string;
  } | null;
}

interface ComingUpSectionProps {
  tasks: Task[];
  timezone: string;
  className?: string;
}

export function ComingUpSection({ tasks, timezone, className }: ComingUpSectionProps) {
  const now = new Date();
  
  const dayGroups = useMemo(() => {
    const groups: { date: Date; label: string; tasks: Task[] }[] = [];
    
    for (let i = 1; i <= 3; i++) {
      const targetDate = addDays(now, i);
      const dayTasks = tasks.filter(task => {
        const taskDate = new Date(task.due_at);
        return isSameDay(taskDate, targetDate);
      }).slice(0, 4);
      
      if (dayTasks.length > 0 || i === 1) {
        groups.push({
          date: targetDate,
          label: i === 1 ? "Tomorrow" : format(targetDate, "EEE"),
          tasks: dayTasks,
        });
      }
    }
    
    return groups;
  }, [tasks, now]);

  if (dayGroups.every(g => g.tasks.length === 0)) {
    return (
      <div className={cn("glass-strong rounded-2xl p-4 overflow-hidden", className)}>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Coming Up</span>
        </div>
        <p className="text-sm text-muted-foreground/60 text-center py-3">
          No tasks in the next 3 days
        </p>
      </div>
    );
  }

  return (
    <div className={cn("glass-strong rounded-2xl p-4 space-y-3 overflow-hidden", className)}>
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Coming Up</span>
      </div>

      <div className="space-y-3">
        {dayGroups.map((group, groupIdx) => (
          <motion.div
            key={group.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.08, ease: EASE_OUT }}
          >
            {/* Day header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                {group.label}
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {format(group.date, "MMM d")}
              </span>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            {/* Tasks - compact list */}
            {group.tasks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 pl-2">Clear</p>
            ) : (
              <div className="space-y-0.5">
                {group.tasks.map((task, taskIdx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: groupIdx * 0.08 + taskIdx * 0.03, ease: EASE_OUT }}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-card/50 transition-colors group"
                  >
                    {/* Thin vertical color border */}
                    <div 
                      className="w-0.5 h-5 rounded-full shrink-0"
                      style={{ backgroundColor: task.course?.color || 'hsl(var(--muted-foreground))' }}
                    />
                    
                    {/* Title */}
                    <span className="text-sm text-foreground/90 truncate flex-1 group-hover:text-foreground transition-colors">
                      {task.title}
                    </span>
                    
                    {/* Time + Course code */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatInTimezone(task.due_at, "h:mma", timezone).toLowerCase()}
                      </span>
                      {task.course && (
                        <span 
                          className="text-[9px] font-semibold uppercase tracking-wide"
                          style={{ color: task.course.color }}
                        >
                          {task.course.short_code}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
