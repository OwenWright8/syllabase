import { useState } from "react";
import { StudyItem, StudyItemStatus } from "@/hooks/useStudyItems";
import { StudyItemCard } from "./StudyItemCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrainCircuit, CheckCircle2, Clock } from "lucide-react";

interface StudyItemsListProps {
  items: StudyItem[];
  onStatusChange: (id: string, status: StudyItemStatus) => void;
  onEdit?: (item: StudyItem) => void;
  onDelete?: (id: string) => void;
  showCourse?: boolean;
  showFilters?: boolean;
}

export function StudyItemsList({
  items,
  onStatusChange,
  onEdit,
  onDelete,
  showCourse = true,
  showFilters = true,
}: StudyItemsListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  const filteredItems = items.filter((item) => {
    if (filter === "active") return item.status !== "done";
    if (filter === "done") return item.status === "done";
    return true;
  });

  const activeCount = items.filter((item) => item.status !== "done").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <BrainCircuit className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-lg text-muted-foreground">No study items yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add the first thing you know you need to study for
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
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {filter === "active" && "No active study items"}
            {filter === "done" && "No completed study items"}
          </div>
        ) : (
          filteredItems.map((item) => (
            <StudyItemCard
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
              showCourse={showCourse}
            />
          ))
        )}
      </div>
    </div>
  );
}
