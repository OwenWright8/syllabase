import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseChip } from "@/components/CourseChip";
import { formatInTimezone } from "@/lib/dateUtils";
import { format, isSameDay, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Clock, BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Quiz } from "@/hooks/useQuizzes";

interface Exam {
  id: string;
  title: string;
  exam_at: string;
  chapters: string | null;
  topics: string | null;
  course: {
    id: string;
    short_code: string;
    color: string;
    name: string;
  };
}

// A single shape the calendar renders, tagging each exam/quiz with its kind
// so day cells and the sidebar can style + route clicks per type.
type CalendarEvent =
  | { kind: "exam"; at: string; data: Exam }
  | { kind: "quiz"; at: string; data: Quiz };

interface ExamCalendarProps {
  exams: Exam[];
  quizzes?: Quiz[];
  timezone: string;
  onExamClick: (exam: Exam) => void;
  onQuizClick?: (quiz: Quiz) => void;
}

export function ExamCalendar({ exams, quizzes = [], timezone, onExamClick, onQuizClick }: ExamCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const events: CalendarEvent[] = [
    ...exams.map((e) => ({ kind: "exam" as const, at: e.exam_at, data: e })),
    ...quizzes.map((q) => ({ kind: "quiz" as const, at: q.quiz_at, data: q })),
  ];

  const handleEventClick = (event: CalendarEvent) => {
    if (event.kind === "exam") onExamClick(event.data);
    else onQuizClick?.(event.data);
  };

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(toZonedTime(new Date(event.at), timezone), day));
  };

  const getEventsForMonth = () => {
    return events
      .filter((event) => isSameMonth(toZonedTime(new Date(event.at), timezone), currentMonth))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  };

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthEvents = getEventsForMonth();

  // Calculate which day of the week the month starts on
  const startDayOfWeek = monthStart.getDay();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Grid */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={goToNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Week day headers */}
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-medium text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the month starts */}
              {Array.from({ length: startDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="min-h-[80px] p-1" />
              ))}

              {/* Days of the month */}
              {daysInMonth.map((day) => {
                const dayEvents = getEventsForDay(day);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[80px] p-1 border rounded-lg transition-colors",
                      isToday && "bg-primary/5 border-primary",
                      !isToday && "border-border hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "text-sm font-medium mb-1",
                        isToday && "text-primary"
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <button
                          key={`${event.kind}-${event.data.id}`}
                          onClick={() => handleEventClick(event)}
                          className="w-full text-left"
                        >
                          <div
                            className="flex items-center gap-1 text-xs p-1 rounded truncate transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: event.data.course.color + "20",
                              borderLeft: `2px solid ${event.data.course.color}`,
                              borderStyle: event.kind === "quiz" ? "dashed" : "solid",
                            }}
                          >
                            {event.kind === "quiz" ? (
                              <ClipboardCheck className="h-3 w-3 shrink-0 opacity-70" />
                            ) : (
                              <GraduationCap className="h-3 w-3 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{event.data.title}</span>
                          </div>
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Sidebar */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {format(currentMonth, "MMMM")} Exams &amp; Quizzes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nothing scheduled this month
              </p>
            ) : (
              monthEvents.map((event) => (
                <button
                  key={`${event.kind}-${event.data.id}`}
                  onClick={() => handleEventClick(event)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {event.kind === "quiz" ? (
                          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium truncate">{event.data.title}</span>
                      </div>
                      <CourseChip
                        shortCode={event.data.course.short_code}
                        color={event.data.course.color}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatInTimezone(event.at, "EEE, MMM d 'at' h:mm a", timezone)}
                    </div>
                  </div>
                  {event.kind === "exam" && event.data.chapters && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3 w-3" />
                      Chapters {event.data.chapters}
                    </div>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
