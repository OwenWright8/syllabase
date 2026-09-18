import { useState } from "react";
import { Reading, ReadingStatus } from "@/hooks/useReadings";
import { ReadingCard } from "./ReadingCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, CheckCircle2, Clock } from "lucide-react";

interface ReadingsListProps {
  readings: Reading[];
  onStatusChange: (id: string, status: ReadingStatus) => void;
  onEdit?: (reading: Reading) => void;
  onDelete?: (id: string) => void;
  showCourse?: boolean;
  showFilters?: boolean;
}

export function ReadingsList({
  readings,
  onStatusChange,
  onEdit,
  onDelete,
  showCourse = true,
  showFilters = true,
}: ReadingsListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  const filteredReadings = readings.filter((r) => {
    if (filter === "active") return r.status !== "done";
    if (filter === "done") return r.status === "done";
    return true;
  });

  const activeCount = readings.filter((r) => r.status !== "done").length;
  const doneCount = readings.filter((r) => r.status === "done").length;

  if (readings.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-lg text-muted-foreground">No readings yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add your first reading to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showFilters && (
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Clock className="h-4 w-4" />
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger value="done" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Done ({doneCount})
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="space-y-2">
        {filteredReadings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {filter === "active" && "No active readings"}
            {filter === "done" && "No completed readings"}
          </div>
        ) : (
          filteredReadings.map((reading) => {
            // Check if this is a task-based reading (has isTask flag or task_id matches id)
            const isTaskBased = reading.isTask === true;
            return (
              <ReadingCard
                key={reading.id}
                reading={reading}
                onStatusChange={onStatusChange}
                onEdit={isTaskBased ? undefined : onEdit}
                onDelete={isTaskBased ? undefined : onDelete}
                showCourse={showCourse}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
