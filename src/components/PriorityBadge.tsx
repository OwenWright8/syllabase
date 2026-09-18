import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Circle } from "lucide-react";

const priorityConfig = {
  low: { label: "Low", icon: Circle, variant: "secondary" as const },
  medium: { label: "Med", icon: AlertCircle, variant: "default" as const },
  high: { label: "High", icon: AlertTriangle, variant: "destructive" as const },
};

interface PriorityBadgeProps {
  priority: "low" | "medium" | "high";
  showIcon?: boolean;
}

export function PriorityBadge({ priority, showIcon = true }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-xs">
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
