import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Reading } from "@/hooks/useReadings";

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface CreateReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    course_id: string;
    title: string;
    pages?: string;
    due_date?: string;
  }) => Promise<{ success: boolean }>;
  courses: Course[];
  defaultCourseId?: string;
  editReading?: Reading | null;
  onUpdate?: (id: string, data: Partial<Reading>) => Promise<{ success: boolean }>;
}

export function CreateReadingDialog({
  open,
  onOpenChange,
  onSubmit,
  courses,
  defaultCourseId,
  editReading,
  onUpdate,
}: CreateReadingDialogProps) {
  const [formData, setFormData] = useState({
    courseId: defaultCourseId || "",
    title: "",
    pages: "",
    dueDate: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editReading) {
      setFormData({
        courseId: editReading.course_id,
        title: editReading.title,
        pages: editReading.pages || "",
        dueDate: editReading.due_date || "",
      });
    } else {
      setFormData({
        courseId: defaultCourseId || "",
        title: "",
        pages: "",
        dueDate: "",
      });
    }
  }, [editReading, defaultCourseId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const data = {
      course_id: formData.courseId,
      title: formData.title.trim(),
      pages: formData.pages.trim() || undefined,
      due_date: formData.dueDate || undefined,
    };

    let result;
    if (editReading && onUpdate) {
      result = await onUpdate(editReading.id, data);
    } else {
      result = await onSubmit(data);
    }

    setIsSubmitting(false);

    if (result.success) {
      onOpenChange(false);
      setFormData({
        courseId: defaultCourseId || "",
        title: "",
        pages: "",
        dueDate: "",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editReading ? "Edit Reading" : "Add Reading"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="course">Course *</Label>
            <Select
              value={formData.courseId}
              onValueChange={(v) => setFormData({ ...formData, courseId: v })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.short_code} - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Chapter 6: Cellular Respiration"
              required
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="pages">Pages / Sections</Label>
            <Input
              id="pages"
              value={formData.pages}
              onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
              placeholder="e.g. pp. 142-168 or Sections 6.1-6.4"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.courseId || !formData.title.trim()}>
              {isSubmitting ? "Saving..." : editReading ? "Save Changes" : "Add Reading"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
