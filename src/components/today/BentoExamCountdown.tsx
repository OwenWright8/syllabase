import { format, differenceInDays } from "date-fns";
import { motion } from "framer-motion";
import { GraduationCap, ClipboardCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";

export interface CountdownItem {
  id: string;
  kind: "exam" | "quiz";
  title: string;
  at: string;
  course: {
    short_code: string;
    color: string;
  } | null;
}

interface BentoExamCountdownProps {
  items: CountdownItem[];
  className?: string;
}

export function BentoExamCountdown({ items, className }: BentoExamCountdownProps) {
  const now = new Date();

  const upcoming = items
    .filter((item) => new Date(item.at) >= now)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 3);

  if (upcoming.length === 0) {
    return (
      <div className={cn("glass-strong rounded-2xl p-4", className)}>
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exams & Quizzes</span>
        </div>
        <p className="text-sm text-muted-foreground/60">Nothing upcoming</p>
      </div>
    );
  }

  return (
    <div className={cn("glass-strong rounded-2xl p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exams & Quizzes</span>
      </div>

      <div className="space-y-2">
        {upcoming.map((item, i) => {
          const daysUntil = differenceInDays(new Date(item.at), now);
          const isUrgent = daysUntil <= 3;
          const Icon = item.kind === "quiz" ? ClipboardCheck : GraduationCap;

          return (
            <motion.div
              key={`${item.kind}-${item.id}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, ease: EASE_OUT }}
              className={cn(
                "flex items-center gap-3 p-2 rounded-xl transition-colors",
                isUrgent ? "bg-destructive/10" : "bg-card/50"
              )}
            >
              {/* Course color bar */}
              <div
                className="h-8 w-0.5 rounded-full shrink-0"
                style={{ backgroundColor: item.course?.color || 'hsl(var(--muted))' }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.title}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {item.course?.short_code} • {format(new Date(item.at), "MMM d")}
                </p>
              </div>

              {/* Countdown */}
              <div className={cn(
                "text-right shrink-0",
                isUrgent && "text-destructive"
              )}>
                {isUrgent && <AlertCircle className="h-3 w-3 mb-0.5 inline-block" />}
                <p className={cn(
                  "text-lg font-bold leading-none",
                  isUrgent ? "text-destructive" : "text-foreground"
                )}>
                  {daysUntil}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {daysUntil === 1 ? "day" : "days"}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
