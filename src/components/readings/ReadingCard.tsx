import { Reading, ReadingStatus } from "@/hooks/useReadings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CourseChip } from "@/components/CourseChip";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Clock,
  MoreHorizontal,
  Trash2,
  Download,
  Edit2,
  Link2,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isPast, isTomorrow } from "date-fns";
import { usePageDownloads } from "@/hooks/usePageDownloads";
import { useReadingBooks } from "@/hooks/useReadingBooks";
import { downloadFilename } from "@/lib/documentPages";
import { matchReadingText } from "@/lib/syllabus";

interface ReadingCardProps {
  reading: Reading;
  onStatusChange: (id: string, status: ReadingStatus) => void;
  onEdit?: (reading: Reading) => void;
  onDelete?: (id: string) => void;
  showCourse?: boolean;
  compact?: boolean;
}

const statusConfig = {
  not_started: {
    label: "Not Started",
    icon: Circle,
    className: "text-muted-foreground",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    className: "text-warning",
  },
  done: {
    label: "Done",
    icon: CheckCircle2,
    className: "text-success",
  },
};

export function ReadingCard({
  reading,
  onStatusChange,
  onEdit,
  onDelete,
  showCourse = true,
  compact = false,
}: ReadingCardProps) {
  const status = statusConfig[reading.status];
  const StatusIcon = status.icon;
  const downloads = usePageDownloads();

  const { booksByCourse } = useReadingBooks();

  // Which pages of a textbook this reading is. A reading added from a syllabus
  // carries the exact range. Any other (typed by hand, or a reading task) is
  // matched from its wording ("Read Chapter 5") against the course's textbooks
  // that have been read by the server, so it can offer the same download.
  const range = (() => {
    if (reading.document_id && reading.start_page != null && reading.end_page != null && !reading.isTask) {
      return {
        documentId: reading.document_id,
        start: reading.start_page,
        end: reading.end_page,
        filename: downloadFilename(reading.document?.filename ?? "Textbook", reading.title, reading.start_page, reading.end_page),
        label: reading.pages || "pages",
      };
    }
    const books = booksByCourse.get(reading.course_id) ?? [];
    const match = matchReadingText(`${reading.title} ${reading.pages ?? ""}`, books);
    if (!match) return null;
    const book = books.find((b) => b.id === match.bookId);
    return {
      documentId: match.bookId,
      start: match.start,
      end: match.end,
      filename: downloadFilename(book?.filename ?? "Textbook", reading.title, match.start, match.end),
      label: match.pages,
    };
  })();
  const downloading = range ? downloads.isBusy(range) : false;
  const downloadLabel = `Download ${range?.label ?? "pages"}`;

  const getDueDateLabel = () => {
    if (!reading.due_date) return null;
    const date = parseISO(reading.due_date);
    
    if (isToday(date)) return { label: "Due today", urgent: true };
    if (isTomorrow(date)) return { label: "Due tomorrow", urgent: false };
    if (isPast(date) && reading.status !== "done") return { label: "Overdue", urgent: true };
    return { label: format(date, "MMM d"), urgent: false };
  };

  const dueInfo = getDueDateLabel();
  const hasLinks = reading.flashcard_deck_id || reading.task_id || reading.exam_id;

  const cycleStatus = () => {
    const statusOrder: ReadingStatus[] = ["not_started", "in_progress", "done"];
    const currentIndex = statusOrder.indexOf(reading.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    onStatusChange(reading.id, nextStatus);
  };

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
          reading.status === "done" && "bg-muted/50 opacity-75"
        )}
      >
        <button
          type="button" aria-label={reading.status === "done" ? "Mark not started" : "Mark done"}
          onClick={() => onStatusChange(reading.id, reading.status === "done" ? "not_started" : "done")}
          className="flex-shrink-0"
        >
          <StatusIcon className={cn("h-5 w-5 transition-colors", status.className)} />
        </button>
        
        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-medium truncate",
            reading.status === "done" && "line-through text-muted-foreground"
          )}>
            {reading.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {reading.pages && <span>{reading.pages}</span>}
            {dueInfo && (
              <span className={cn(dueInfo.urgent && reading.status !== "done" && "text-destructive font-medium")}>
                {dueInfo.label}
              </span>
            )}
          </div>
        </div>

        {range && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            aria-label={downloadLabel}
            title={downloadLabel}
            disabled={downloading}
            onClick={() => downloads.download(range)}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        )}

        {showCourse && reading.course && (
          <CourseChip shortCode={reading.course.short_code} color={reading.course.color} />
        )}
      </div>
    );
  }

  return (
    <Card className={cn(
      "transition-all",
      reading.status === "done" && "bg-muted/30"
    )}>
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
                <h3 className={cn(
                  "font-medium",
                  reading.status === "done" && "line-through text-muted-foreground"
                )}>
                  {reading.title}
                </h3>
                {reading.pages && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {reading.pages}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={`More actions for ${reading.title}`} variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onStatusChange(reading.id, "not_started")}>
                    <Circle className="h-4 w-4 mr-2" /> Not Started
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(reading.id, "in_progress")}>
                    <Clock className="h-4 w-4 mr-2" /> In Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(reading.id, "done")}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Done
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(reading)}>
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(reading.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {showCourse && reading.course && (
                <CourseChip shortCode={reading.course.short_code} color={reading.course.color} />
              )}
              
              {dueInfo && (
                <Badge 
                  variant={dueInfo.urgent && reading.status !== "done" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  {dueInfo.label}
                </Badge>
              )}

              {range && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-xs"
                  aria-label={downloadLabel}
                  disabled={downloading}
                  onClick={() => downloads.download(range)}
                >
                  {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  {downloadLabel}
                </Button>
              )}

              {hasLinks && (
                <Badge variant="outline" className="text-xs">
                  <Link2 className="h-3 w-3 mr-1" />
                  Linked
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
