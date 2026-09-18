import { Button } from "@/components/ui/button";
import { CourseChip } from "@/components/CourseChip";
import { useStudyItems, StudyItem, StudyItemStatus } from "@/hooks/useStudyItems";
import { BrainCircuit, ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UpcomingStudyWidgetProps {
  maxItems?: number;
}

const statusIcon: Record<StudyItemStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

// Items linked to an exam/quiz surface first (soonest assessment first),
// freestanding items trail behind ordered by priority.
const priorityRank: Record<StudyItem["priority"], number> = { high: 0, medium: 1, low: 2 };

export function UpcomingStudyWidget({ maxItems = 3 }: UpcomingStudyWidgetProps) {
  const { studyItems, loading, updateStatus } = useStudyItems();

  if (loading) return null;

  const active = studyItems.filter((i) => i.status !== "done");
  if (active.length === 0) return null;

  const sorted = [...active].sort((a, b) => {
    const aAt = a.exam?.exam_at ?? a.quiz?.quiz_at ?? null;
    const bAt = b.exam?.exam_at ?? b.quiz?.quiz_at ?? null;
    if (aAt && bAt) return new Date(aAt).getTime() - new Date(bAt).getTime();
    if (aAt) return -1;
    if (bAt) return 1;
    return priorityRank[a.priority] - priorityRank[b.priority];
  });

  const displayItems = sorted.slice(0, maxItems);
  const hasMore = sorted.length > maxItems;

  const cycleStatus = (item: StudyItem) => {
    const order: StudyItemStatus[] = ["not_started", "in_progress", "done"];
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    updateStatus(item.id, next);
  };

  return (
    <div className="glass-strong rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To Study</span>
        </div>
        <Link to="/study">
          <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-xs">
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        {displayItems.map((item) => {
          const StatusIcon = statusIcon[item.status];
          const linkedTitle = item.exam?.title ?? item.quiz?.title;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 rounded-xl bg-card/50 transition-colors"
            >
              <button onClick={() => cycleStatus(item)} className="flex-shrink-0">
                <StatusIcon
                  className={cn(
                    "h-5 w-5 transition-colors",
                    item.status === "in_progress" ? "text-warning" : "text-muted-foreground"
                  )}
                />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {linkedTitle && <span className="truncate">{linkedTitle}</span>}
                </div>
              </div>

              {item.course && (
                <CourseChip shortCode={item.course.short_code} color={item.course.color} />
              )}
            </div>
          );
        })}
        {hasMore && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{sorted.length - maxItems} more to study
          </p>
        )}
      </div>
    </div>
  );
}
