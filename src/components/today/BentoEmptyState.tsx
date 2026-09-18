import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PartyPopper, Sparkles, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeUp, SPRING } from "@/lib/motion";

interface BentoEmptyStateProps {
  className?: string;
}

export function BentoEmptyState({ className }: BentoEmptyStateProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className={cn("glass-strong rounded-2xl p-10 text-center", className)}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.05 }}
        className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-success/10 mb-5"
      >
        <PartyPopper className="h-6 w-6 text-success" />
      </motion.div>

      <h3 className="text-xl font-semibold text-foreground mb-2">
        You're all caught up
      </h3>

      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        All tasks complete for today. Check "Coming Up" to get ahead, or take a well-deserved break.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button variant="default" size="sm" asChild className="gap-2 px-5">
          <Link to="/planner">
            <CalendarRange className="h-4 w-4" />
            Plan Ahead
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2 px-5">
          <Link to="/readings">
            <Sparkles className="h-4 w-4" />
            Catch Up on Readings
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
