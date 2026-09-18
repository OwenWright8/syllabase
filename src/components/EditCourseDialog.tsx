import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Course {
  id: string;
  name: string;
  short_code: string;
  color: string;
  semester: string | null;
}

interface EditCourseDialogProps {
  course: Course | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditCourseDialog({ course, open, onOpenChange, onSuccess }: EditCourseDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    shortCode: "",
    color: "#3b82f6",
    semester: "",
  });

  useEffect(() => {
    if (course) {
      setFormData({
        name: course.name,
        shortCode: course.short_code,
        color: course.color,
        semester: course.semester || "",
      });
    }
  }, [course]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;

    const { error } = await supabase
      .from("courses")
      .update({
        name: formData.name,
        short_code: formData.shortCode,
        color: formData.color,
        semester: formData.semester || null,
      })
      .eq("id", course.id);

    if (error) {
      toast.error("Failed to update course");
    } else {
      toast.success("Course updated successfully");
      onOpenChange(false);
      onSuccess();
    }
  };

  const handleDelete = async () => {
    if (!course || !confirm("Are you sure you want to delete this course? This will also delete all related tasks and exams.")) return;

    const { error } = await supabase.from("courses").delete().eq("id", course.id);

    if (error) {
      toast.error("Failed to delete course");
    } else {
      toast.success("Course deleted");
      onOpenChange(false);
      onSuccess();
    }
  };

  if (!course) return null;

  const colorOptions = [
    { value: "#ef4444", label: "Red" },
    { value: "#f97316", label: "Orange" },
    { value: "#f59e0b", label: "Amber" },
    { value: "#eab308", label: "Yellow" },
    { value: "#84cc16", label: "Lime" },
    { value: "#10b981", label: "Green" },
    { value: "#06b6d4", label: "Cyan" },
    { value: "#3b82f6", label: "Blue" },
    { value: "#6366f1", label: "Indigo" },
    { value: "#8b5cf6", label: "Violet" },
    { value: "#a855f7", label: "Purple" },
    { value: "#ec4899", label: "Pink" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Course Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. General Chemistry"
              required
            />
          </div>

          <div>
            <Label htmlFor="shortCode">Short Code *</Label>
            <Input
              id="shortCode"
              value={formData.shortCode}
              onChange={(e) => setFormData({ ...formData, shortCode: e.target.value })}
              placeholder="e.g. CHE-111"
              required
            />
          </div>

          <div>
            <Label htmlFor="semester">Semester</Label>
            <Input
              id="semester"
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              placeholder="e.g. Fall 2025"
            />
          </div>

          <div>
            <Label htmlFor="color">Color</Label>
            <div className="grid grid-cols-6 gap-2 mt-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`w-10 h-10 rounded-md border-2 ${
                    formData.color === color.value ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete Course
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
