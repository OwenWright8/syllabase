import { motion } from "framer-motion";
import { CheckCircle2, TrendingUp, Award, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

interface QuickStatsBentoProps {
  completedToday: number;
  totalToday: number;
  overdueCount: number;
  weekCompleted: number;
  weekTotal: number;
  termCompleted: number;
  className?: string;
}

export function QuickStatsBento({
  completedToday,
  totalToday,
  overdueCount,
  weekCompleted,
  weekTotal,
  termCompleted,
  className,
}: QuickStatsBentoProps) {
  const todayProgress = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 100;
  const weekProgress = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

  const stats = [
    {
      label: "Today",
      value: `${completedToday}/${totalToday}`,
      sub: overdueCount > 0 ? `${overdueCount} overdue` : `${todayProgress}% done`,
      subClass: overdueCount > 0 ? "text-destructive" : "text-muted-foreground",
      icon: todayProgress === 100 ? Flame : CheckCircle2,
    },
    {
      label: "This Week",
      value: `${weekProgress}%`,
      sub: `${weekCompleted}/${weekTotal} tasks`,
      subClass: "text-muted-foreground",
      icon: TrendingUp,
    },
    {
      label: "Term Total",
      value: String(termCompleted),
      sub: "completed",
      subClass: "text-muted-foreground",
      icon: Award,
    },
  ];

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className={cn("glass-strong rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-border flex flex-col sm:flex-row", className)}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <stat.icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-semibold text-foreground leading-tight">{stat.value}</p>
            <p className={cn("text-[11px]", stat.subClass)}>{stat.sub}</p>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
