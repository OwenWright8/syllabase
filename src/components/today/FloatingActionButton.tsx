import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ClipboardList, FileText, GraduationCap, BookOpen, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING, SPRING_SNAPPY, DURATION, EASE_OUT } from "@/lib/motion";

interface FloatingActionButtonProps {
  className?: string;
}

export function FloatingActionButton({ className }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { icon: ClipboardList, label: "Assignment", href: "/assignments", color: "bg-primary text-primary-foreground" },
    { icon: FileText, label: "Reading", href: "/readings", color: "bg-info text-info-foreground" },
    { icon: BrainCircuit, label: "Study Item", href: "/study", color: "bg-accent text-accent-foreground" },
    { icon: GraduationCap, label: "Exam", href: "/exams", color: "bg-warning text-warning-foreground" },
    { icon: BookOpen, label: "Course", href: "/courses", color: "bg-success text-success-foreground" },
  ];

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)}>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <AnimatePresence>
        {isOpen && (
          <div className="absolute bottom-16 right-0 flex flex-col-reverse items-end gap-3">
            {actions.map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.8, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
                transition={{ ...SPRING_SNAPPY, delay: i * 0.04 }}
                className="flex items-center gap-3"
              >
                <span className="text-sm font-medium text-foreground bg-card px-3 py-1.5 rounded-lg border border-border shadow-soft-sm">
                  {action.label}
                </span>
                <Link
                  to={action.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center shadow-soft-lg",
                    "transition-smooth hover:scale-110 active:scale-95",
                    action.color
                  )}
                >
                  <action.icon className="h-5 w-5" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Main FAB */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-14 w-14 rounded-full flex items-center justify-center",
          "bg-primary shadow-soft-lg",
          "transition-smooth hover:scale-105 active:scale-95",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
        )}
        animate={{ rotate: isOpen ? 45 : 0 }}
        transition={SPRING}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-primary-foreground" />
        ) : (
          <Plus className="h-6 w-6 text-primary-foreground" />
        )}
      </motion.button>
    </div>
  );
}
