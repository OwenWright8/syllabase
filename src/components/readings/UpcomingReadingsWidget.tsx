import { useUpcomingReadings, ReadingStatus } from "@/hooks/useReadings";
import { Button } from "@/components/ui/button";
import { ReadingCard } from "./ReadingCard";
import { BookOpen, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpcomingReadingsWidgetProps {
  maxItems?: number;
}

export function UpcomingReadingsWidget({ maxItems = 3 }: UpcomingReadingsWidgetProps) {
  const { readings, loading, refetch } = useUpcomingReadings();

  const handleStatusChange = async (id: string, status: ReadingStatus) => {
    const completed_at = status === "done" ? new Date().toISOString() : null;
    
    const { error } = await supabase
      .from("readings")
      .update({ status, completed_at })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    if (status === "done") {
      toast.success("Reading completed! 📚");
    }
    
    refetch();
  };

  if (loading) {
    return null;
  }

  if (readings.length === 0) {
    return null;
  }

  const displayReadings = readings.slice(0, maxItems);
  const hasMore = readings.length > maxItems;

  return (
    <div className="glass-strong rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Readings</span>
        </div>
        <Link to="/readings">
          <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-xs">
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        {displayReadings.map((reading) => (
          <ReadingCard
            key={reading.id}
            reading={reading}
            onStatusChange={handleStatusChange}
            showCourse={true}
            compact={true}
          />
        ))}
        {hasMore && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{readings.length - maxItems} more readings
          </p>
        )}
      </div>
    </div>
  );
}
