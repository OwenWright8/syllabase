import { useState, useEffect } from "react";
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

interface CreateQuizDialogProps {
  courses: Course[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  timezone: string;
  /** Pre-fills the date (YYYY-MM-DD) each time the dialog opens. */
  defaultDate?: string;
}

export function CreateQuizDialog({ courses, open, onOpenChange, onSuccess, timezone, defaultDate }: CreateQuizDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    courseId: "",
    title: "",
    quizDate: "",
    quizTime: "09:00",
    topics: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && defaultDate) setFormData((prev) => ({ ...prev, quizDate: defaultDate }));
  }, [open, defaultDate]);

  const resetForm = () => {
    setFormData({
      courseId: "",
      title: "",
      quizDate: "",
      quizTime: "09:00",
      topics: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);

    const quizAt = parseInTimezone(formData.quizDate, formData.quizTime, timezone);

    const { error } = await supabase
      .from("quizzes")
      .insert({
        user_id: user.id,
        course_id: formData.courseId,
        title: formData.title,
        quiz_at: quizAt,
        topics: formData.topics || null,
      });

    setIsSubmitting(false);

    if (error) {
      console.error("Quiz creation error:", error);
      toast.error("Failed to create quiz: " + error.message);
      return;
    }

    toast.success("Quiz added to calendar!");
    resetForm();
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Quiz</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="quiz-course">Course *</Label>
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
            <Label htmlFor="quiz-title">Quiz Title *</Label>
            <Input
              id="quiz-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Quiz 3, Pop Quiz"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quiz-date">Date *</Label>
              <Input
                id="quiz-date"
                type="date"
                value={formData.quizDate}
                onChange={(e) => setFormData({ ...formData, quizDate: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="quiz-time">Time *</Label>
              <Input
                id="quiz-time"
                type="time"
                value={formData.quizTime}
                onChange={(e) => setFormData({ ...formData, quizTime: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="quiz-topics">Topics</Label>
            <Textarea
              id="quiz-topics"
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
              {isSubmitting ? "Adding..." : "Add Quiz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
