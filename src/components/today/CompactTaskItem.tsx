import { useState } from "react";
import { Check, Clock, Zap, Sparkles, Plus } from "lucide-react";
import { CourseChip } from "@/components/CourseChip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInTimezone } from "@/lib/dateUtils";
import { motion } from "framer-motion";
import { EASE_OUT, SPRING_SNAPPY, DURATION } from "@/lib/motion";

type UrgencyLevel = "overdue" | "due-soon" | "normal";

interface CompactTaskItemProps {
  task: {
    id: string;
    title: string;
    due_at: string;
    type: string;
    course: {
      short_code: string;
      color: string;
    } | null;
  };
  timezone: string;
  urgency: UrgencyLevel;
  onComplete: (taskId: string) => void;
  isRecommended?: boolean;
  /** When provided, shows a quick "add to today's ordered plan" action. */
  onAddToPlan?: (taskId: string) => void;
}

export function CompactTaskItem({ task, timezone, urgency, onComplete, isRecommended, onAddToPlan }: CompactTaskItemProps) {
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCompleting(true);
    setTimeout(() => {
      onComplete(task.id);
    }, 400);
  };

  const handleAddToPlan = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToPlan?.(task.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ 
        opacity: isCompleting ? 0 : 1, 
        x: isCompleting ? 20 : 0,
        scale: isCompleting ? 0.95 : 1,
      }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      className={cn(
        "group relative flex items-center gap-3 py-3 px-3 rounded-xl transition-smooth",
        "hover:bg-muted/50",
        isRecommended && "bg-primary/5",
        urgency === "overdue" && "border-l-[3px] border-l-destructive bg-destructive/5",
        urgency === "due-soon" && "border-l-[3px] border-l-warning bg-warning/5"
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        aria-label={`Mark "${task.title}" complete`}
        onClick={handleComplete}
        disabled={isCompleting}
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border-2 transition-smooth",
          "flex items-center justify-center",
          "hover:scale-110 active:scale-95",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50",
          isCompleting
            ? "border-success bg-success text-success-foreground scale-110"
            : urgency === "overdue"
            ? "border-destructive/50 hover:border-destructive hover:bg-destructive/10"
            : urgency === "due-soon"
            ? "border-warning/50 hover:border-warning hover:bg-warning/10"
            : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
        )}
      >
        {isCompleting && (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={SPRING_SNAPPY}
          >
            <Check className="h-3 w-3" />
          </motion.div>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {/* Recommended badge */}
          {isRecommended && !isCompleting && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              <Zap className="h-2.5 w-2.5" />
              Focus
            </span>
          )}
          
          {/* Title */}
          <span className={cn(
            "text-sm font-medium truncate",
            isCompleting && "line-through text-muted-foreground",
            isRecommended && "text-foreground"
          )}>
            {task.title}
          </span>
        </div>
        
        {/* Meta info */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatInTimezone(task.due_at, "h:mm a", timezone)}
          </span>
        </div>
      </div>

      {/* Course chip */}
      {task.course && (
        <CourseChip
          shortCode={task.course.short_code}
          color={task.course.color}
          className="shrink-0 text-[10px] px-2 py-0.5 font-medium"
        />
      )}

      {/* Add to today's ordered plan */}
      {onAddToPlan && !isCompleting && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAddToPlan}
          title="Add to today's plan"
          className="shrink-0 h-7 w-7 text-muted-foreground/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-primary hover:bg-primary/10 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Sparkle effect on complete */}
      {isCompleting && (
        <motion.div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        >
          <Sparkles className="h-5 w-5 text-success animate-pulse" />
        </motion.div>
      )}
    </motion.div>
  );
}
