import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCreateCourse } from "@/hooks/useCourses";
import { cn } from "@/lib/utils";

const colorOptions = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

const emptyForm = () => ({
  name: "",
  shortCode: "",
  color: colorOptions[0],
  semester: "",
});

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Shared by the Courses page and the Today page's quick-add menu, so a course
// can be created from either without navigating.
export function CreateCourseDialog({ open, onOpenChange }: CreateCourseDialogProps) {
  const createCourse = useCreateCourse();
  const [formData, setFormData] = useState(emptyForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createCourse.mutateAsync({
        name: formData.name,
        short_code: formData.shortCode,
        color: formData.color,
        semester: formData.semester || null,
      });
      toast.success("Course created successfully");
      onOpenChange(false);
      setFormData(emptyForm());
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-border/50">
        <DialogHeader>
          <DialogTitle>Create New Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Course Name *</Label>
            <Input
              id="name"
              placeholder="e.g. General Chemistry"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 rounded-xl"
              required
            />
          </div>

          <div>
            <Label htmlFor="shortCode">Short Code *</Label>
            <Input
              id="shortCode"
              placeholder="e.g. CHEM 111"
              value={formData.shortCode}
              onChange={(e) => setFormData({ ...formData, shortCode: e.target.value })}
              className="mt-1 rounded-xl"
              required
            />
          </div>

          <div>
            <Label htmlFor="semester">Semester</Label>
            <Input
              id="semester"
              placeholder="e.g. Spring 2024"
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              className="mt-1 rounded-xl"
            />
          </div>

          <div>
            <Label>Color *</Label>
            <div className="flex gap-2 mt-2">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={cn(
                    "w-10 h-10 rounded-full transition-all",
                    formData.color === color ? "ring-4 ring-ring scale-110" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={createCourse.isPending}>
              Create Course
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
