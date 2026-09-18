import { Badge } from "@/components/ui/badge";

interface CourseChipProps {
  shortCode: string;
  color: string;
  className?: string;
}

export function CourseChip({ shortCode, color, className }: CourseChipProps) {
  return (
    <Badge
      className={className}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}40`,
        boxShadow: `0 2px 8px ${color}10`,
      }}
      variant="outline"
    >
      {shortCode}
    </Badge>
  );
}
