import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { parseInTimezone } from "@/lib/dateUtils";

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface CreateExamDialogProps {
  courses: Course[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  timezone: string;
}

export function CreateExamDialog({ courses, open, onOpenChange, onSuccess, timezone }: CreateExamDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    courseId: "",
    title: "",
    examDate: "",
    examTime: "09:00",
    chapters: "",
    topics: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      courseId: "",
      title: "",
      examDate: "",
      examTime: "09:00",
      chapters: "",
      topics: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);

    const examAt = parseInTimezone(formData.examDate, formData.examTime, timezone);

    const { error } = await supabase
      .from("exams")
      .insert({
        user_id: user.id,
        course_id: formData.courseId,
        title: formData.title,
        exam_at: examAt,
        chapters: formData.chapters || null,
        topics: formData.topics || null,
        study_days_before: 0, // No longer used for study plan
      });

    setIsSubmitting(false);

    if (error) {
      console.error("Exam creation error:", error);
      toast.error("Failed to create exam: " + error.message);
      return;
    }

    toast.success("Exam added to calendar!");
    resetForm();
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Exam</DialogTitle>
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
            <Label htmlFor="title">Exam Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Midterm 1, Final Exam"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="examDate">Date *</Label>
              <Input
                id="examDate"
                type="date"
                value={formData.examDate}
                onChange={(e) => setFormData({ ...formData, examDate: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="examTime">Time *</Label>
              <Input
                id="examTime"
                type="time"
                value={formData.examTime}
                onChange={(e) => setFormData({ ...formData, examTime: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="chapters">Chapters</Label>
            <Input
              id="chapters"
              value={formData.chapters}
              onChange={(e) => setFormData({ ...formData, chapters: e.target.value })}
              placeholder="e.g. 1-5, 7, 9-12"
            />
          </div>

          <div>
            <Label htmlFor="topics">Topics</Label>
            <Textarea
              id="topics"
              value={formData.topics}
              onChange={(e) => setFormData({ ...formData, topics: e.target.value })}
              placeholder="Key topics to review..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Exam"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
