import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, FlaskConical, GraduationCap, ClipboardCheck, FolderKanban, BookMarked } from "lucide-react";

const taskTypeConfig = {
  reading: { label: "Reading", icon: BookOpen, color: "info" },
  homework: { label: "HW", icon: FileText, color: "primary" },
  lab: { label: "Lab", icon: FlaskConical, color: "warning" },
  exam: { label: "Exam", icon: GraduationCap, color: "destructive" },
  quiz: { label: "Quiz", icon: ClipboardCheck, color: "warning" },
  exam_prep: { label: "Exam Prep", icon: BookMarked, color: "destructive" },
  project: { label: "Project", icon: FolderKanban, color: "accent" },
  other: { label: "Other", icon: FileText, color: "muted" },
};

interface TaskTypeLabelProps {
  type: string;
  showIcon?: boolean;
}

export function TaskTypeLabel({ type, showIcon = false }: TaskTypeLabelProps) {
  const config = taskTypeConfig[type as keyof typeof taskTypeConfig] ?? taskTypeConfig.other;
  const Icon = config.icon;

  return (
    <Badge variant="secondary" className="text-xs">
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
