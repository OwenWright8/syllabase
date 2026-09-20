import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CourseChip } from "@/components/CourseChip";
import { TaskTypeLabel } from "@/components/TaskTypeLabel";
import { Calendar, Clock, Edit, Check, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimezone } from "@/lib/dateUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Task {
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

interface TaskCardProps {
  task: Task;
  isOverdue?: boolean;
  onComplete: (taskId: string) => void;
  onEdit?: (task: Task) => void;
}

export function TaskCard({ task, isOverdue, onComplete, onEdit }: TaskCardProps) {
  const { timezone } = useUserTimezone();
  const [isCompleting, setIsCompleting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleComplete = async () => {
    setIsCompleting(true);
    setShowConfetti(true);
    
    // Wait for animation to play
    setTimeout(() => {
      onComplete(task.id);
    }, 600);
  };
  
  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        isOverdue
          ? "border-destructive/50 bg-destructive/5"
          : "hover:border-primary/30",
        isCompleting && "scale-[0.98] opacity-0 translate-x-4"
      )}
    >
      {/* Confetti burst animation */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <Sparkles
              key={i}
              className={cn(
                "absolute h-3 w-3 md:h-4 md:w-4 text-primary animate-ping",
                i % 3 === 0 && "text-accent",
                i % 3 === 1 && "text-success"
              )}
              style={{
                left: `${10 + (i * 7)}%`,
                top: `${20 + (i % 4) * 15}%`,
                animationDelay: `${i * 50}ms`,
                animationDuration: '500ms'
              }}
            />
          ))}
        </div>
      )}
      
      <CardContent className="p-3 sm:p-4 md:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Completion checkbox - Always visible on left for touch friendliness */}
          <button
            type="button" aria-label={`Mark "${task.title}" complete`}
            onClick={handleComplete}
            disabled={isCompleting}
            className={cn(
              "flex-shrink-0 mt-0.5 h-6 w-6 sm:h-7 sm:w-7 rounded-full border-2 transition-all duration-300",
              "flex items-center justify-center touch-manipulation",
              "hover:scale-110 hover:border-primary hover:bg-primary/10",
              "active:scale-95",
              isCompleting 
                ? "border-success bg-success text-success-foreground scale-110" 
                : "border-muted-foreground/30 hover:border-primary"
            )}
          >
            {isCompleting && (
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-scale-in" />
            )}
          </button>
          
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
            {/* Title and badges row */}
            <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
              <h3 className={cn(
                "text-sm sm:text-base font-medium leading-tight",
                isCompleting && "line-through text-muted-foreground"
              )}>
                {task.title}
              </h3>
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                {task.course && (
                  <CourseChip shortCode={task.course.short_code} color={task.course.color} />
                )}
                <TaskTypeLabel type={task.type} />
                {isOverdue && (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground font-medium shadow-soft-sm animate-pulse">
                    LATE
                  </span>
                )}
              </div>
            </div>
            
            {/* Description */}
            {task.description && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}
            
            {/* Date/time info */}
            <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span>Due {formatInTimezone(task.due_at, "MMM d", timezone)}</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span>{formatInTimezone(task.due_at, "h:mm a", timezone)}</span>
              </div>
            </div>
          </div>
          
          {/* Edit button */}
          {onEdit && (
            <Button
              aria-label={`Edit "${task.title}"`}
              variant="ghost"
              size="icon"
              onClick={() => onEdit(task)}
              className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
