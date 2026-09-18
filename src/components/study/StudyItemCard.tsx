import { StudyItem, StudyItemStatus } from "@/hooks/useStudyItems";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CourseChip } from "@/components/CourseChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Badge } from "@/components/ui/badge";
import {
  BrainCircuit,
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Trash2,
  Edit2,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface StudyItemCardProps {
  item: StudyItem;
  onStatusChange: (id: string, status: StudyItemStatus) => void;
  onEdit?: (item: StudyItem) => void;
  onDelete?: (id: string) => void;
  showCourse?: boolean;
}

const statusConfig = {
  not_started: { label: "Not Started", icon: Circle, className: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock, className: "text-warning" },
  done: { label: "Done", icon: CheckCircle2, className: "text-success" },
};

export function StudyItemCard({ item, onStatusChange, onEdit, onDelete, showCourse = true }: StudyItemCardProps) {
  const status = statusConfig[item.status];
  const StatusIcon = status.icon;

  const cycleStatus = () => {
    const order: StudyItemStatus[] = ["not_started", "in_progress", "done"];
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    onStatusChange(item.id, next);
  };

  return (
    <Card className={cn("transition-all", item.status === "done" && "bg-muted/30")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={cycleStatus}
            className="flex-shrink-0 mt-0.5"
            title={`Status: ${status.label}. Click to change.`}
          >
            <StatusIcon className={cn("h-5 w-5 transition-colors hover:scale-110", status.className)} />
          </button>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={cn("font-medium", item.status === "done" && "line-through text-muted-foreground")}>
                  {item.title}
                </h3>
                {item.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{item.notes}</p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onStatusChange(item.id, "not_started")}>
                    <Circle className="h-4 w-4 mr-2" /> Not Started
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(item.id, "in_progress")}>
                    <Clock className="h-4 w-4 mr-2" /> In Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(item.id, "done")}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Done
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {showCourse && item.course && (
                <CourseChip shortCode={item.course.short_code} color={item.course.color} />
              )}
              <PriorityBadge priority={item.priority} />
              {item.exam && (
                <Badge variant="outline" className="text-xs">
                  <GraduationCap className="h-3 w-3 mr-1" />
                  {item.exam.title}
                </Badge>
              )}
              {item.quiz && (
                <Badge variant="outline" className="text-xs">
                  <ClipboardCheck className="h-3 w-3 mr-1" />
                  {item.quiz.title}
                </Badge>
              )}
              {item.planned_date && (
                <Badge variant="secondary" className="text-xs">
                  <BrainCircuit className="h-3 w-3 mr-1" />
                  Planned {format(parseISO(item.planned_date), "MMM d")}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
