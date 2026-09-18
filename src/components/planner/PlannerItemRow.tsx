import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseChip } from "@/components/CourseChip";
import { ChevronUp, ChevronDown, Plus, X, Check, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlannerItemRowProps {
  title: string;
  typeLabel: string;
  course: { short_code: string; color: string } | null;
  scheduledLabel?: string | null;
  mode: "pool" | "plan";
  onAdd?: () => void;
  onRemove?: () => void;
  onComplete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function PlannerItemRow({
  title,
  typeLabel,
  course,
  scheduledLabel,
  mode,
  onAdd,
  onRemove,
  onComplete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: PlannerItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/50 bg-card/50 p-2.5 pl-3 transition-colors",
        mode === "plan" && "bg-card"
      )}
    >
      {mode === "plan" && (
        <div className="flex flex-col -my-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="h-4 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:text-muted-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="h-4 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:text-muted-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {course && <CourseChip shortCode={course.short_code} color={course.color} />}
          <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
          {scheduledLabel && (
            <Badge variant="outline" className="text-xs gap-1">
              <CalendarClock className="h-3 w-3" />
              {scheduledLabel}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {mode === "plan" && onComplete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-success hover:bg-success/10" onClick={onComplete} title="Mark done">
            <Check className="h-4 w-4" />
          </Button>
        )}
        {mode === "pool" && onAdd && (
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary hover:bg-primary/10" onClick={onAdd} title="Add to today's plan">
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {mode === "plan" && onRemove && (
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive hover:bg-destructive/10" onClick={onRemove} title="Remove from plan">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
