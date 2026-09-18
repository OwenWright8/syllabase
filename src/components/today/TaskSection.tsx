import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, CalendarCheck } from "lucide-react";
import { fadeUp } from "@/lib/motion";

interface TaskSectionProps {
  title: string;
  count: number;
  variant?: "default" | "overdue" | "due-soon" | "muted";
  children: ReactNode;
}

export function TaskSection({ title, count, variant = "default", children }: TaskSectionProps) {
  const Icon = variant === "overdue" ? AlertTriangle : variant === "due-soon" ? Clock : CalendarCheck;
  
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="space-y-2"
    >
      <div className="flex items-center gap-2 px-1">
        <Icon className={cn(
          "h-3.5 w-3.5",
          variant === "overdue" && "text-destructive",
          variant === "due-soon" && "text-warning",
          variant === "default" && "text-primary",
          variant === "muted" && "text-muted-foreground/50"
        )} />
        <h3 className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          variant === "overdue" && "text-destructive",
          variant === "due-soon" && "text-foreground",
          variant === "default" && "text-foreground/80",
          variant === "muted" && "text-muted-foreground/60"
        )}>
          {title}
        </h3>
        <span className={cn(
          "text-[10px] px-2 py-0.5 rounded-full font-semibold",
          variant === "overdue" && "bg-destructive/10 text-destructive",
          variant === "due-soon" && "bg-warning/10 text-warning",
          variant === "default" && "bg-primary/10 text-primary",
          variant === "muted" && "bg-muted/50 text-muted-foreground/60"
        )}>
          {count}
        </span>
      </div>
      <div
        className={cn(
          "glass-strong rounded-xl p-1 space-y-0.5",
          variant === "default" ? "shadow-soft-md ring-1 ring-primary/10" : "shadow-soft-sm"
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
