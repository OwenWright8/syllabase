import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StudyItem, StudyItemPriority } from "@/hooks/useStudyItems";
import { Exam } from "@/hooks/useExams";
import { Quiz } from "@/hooks/useQuizzes";
import { formatInTimezone } from "@/lib/dateUtils";
import { useUserTimezone } from "@/hooks/useUserTimezone";

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface CreateStudyItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    course_id?: string | null;
    exam_id?: string | null;
    quiz_id?: string | null;
    notes?: string | null;
    priority?: StudyItemPriority;
  }) => Promise<{ success: boolean }>;
  courses: Course[];
  exams: Exam[];
  quizzes: Quiz[];
  defaultCourseId?: string;
  editItem?: StudyItem | null;
  onUpdate?: (id: string, data: Partial<StudyItem>) => Promise<{ success: boolean }>;
}

const emptyForm = (defaultCourseId?: string) => ({
  courseId: defaultCourseId || "none",
  title: "",
  notes: "",
  priority: "medium" as StudyItemPriority,
  examId: "none",
  quizId: "none",
});

export function CreateStudyItemDialog({
  open,
  onOpenChange,
  onSubmit,
  courses,
  exams,
  quizzes,
  defaultCourseId,
  editItem,
  onUpdate,
}: CreateStudyItemDialogProps) {
  const { timezone } = useUserTimezone();
  const [formData, setFormData] = useState(emptyForm(defaultCourseId));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editItem) {
      setFormData({
        courseId: editItem.course_id || "none",
        title: editItem.title,
        notes: editItem.notes || "",
        priority: editItem.priority,
        examId: editItem.exam_id || "none",
        quizId: editItem.quiz_id || "none",
      });
    } else {
      setFormData(emptyForm(defaultCourseId));
    }
  }, [editItem, defaultCourseId, open]);

  // Narrow the exam/quiz pickers to the selected course once one is chosen,
  // so users aren't hunting through every course's exams for the right one.
  const relevantExams = useMemo(
    () => (formData.courseId === "none" ? exams : exams.filter((e) => e.course.id === formData.courseId)),
    [exams, formData.courseId]
  );
  const relevantQuizzes = useMemo(
    () => (formData.courseId === "none" ? quizzes : quizzes.filter((q) => q.course.id === formData.courseId)),
    [quizzes, formData.courseId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const data = {
      title: formData.title.trim(),
      course_id: formData.courseId === "none" ? null : formData.courseId,
      exam_id: formData.examId === "none" ? null : formData.examId,
      quiz_id: formData.quizId === "none" ? null : formData.quizId,
      notes: formData.notes.trim() || null,
      priority: formData.priority,
    };

    let result;
    if (editItem && onUpdate) {
      result = await onUpdate(editItem.id, data);
    } else {
      result = await onSubmit(data);
    }

    setIsSubmitting(false);

    if (result.success) {
      onOpenChange(false);
      setFormData(emptyForm(defaultCourseId));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Study Item" : "Add Study Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="study-title">What do you need to study? *</Label>
            <Input
              id="study-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Krebs cycle, Chapters 4-6 vocab"
              required
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="study-course">Course</Label>
            <Select
              value={formData.courseId}
              onValueChange={(v) => setFormData({ ...formData, courseId: v, examId: "none", quizId: "none" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.short_code} - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="study-exam">Link to Exam</Label>
              <Select value={formData.examId} onValueChange={(v) => setFormData({ ...formData, examId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {relevantExams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.title} — {formatInTimezone(exam.exam_at, "MMM d", timezone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="study-quiz">Link to Quiz</Label>
              <Select value={formData.quizId} onValueChange={(v) => setFormData({ ...formData, quizId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {relevantQuizzes.map((quiz) => (
                    <SelectItem key={quiz.id} value={quiz.id}>
                      {quiz.title} — {formatInTimezone(quiz.quiz_at, "MMM d", timezone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="study-priority">Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(v) => setFormData({ ...formData, priority: v as StudyItemPriority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="study-notes">Notes</Label>
            <Textarea
              id="study-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Anything specific to focus on..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.title.trim()}>
              {isSubmitting ? "Saving..." : editItem ? "Save Changes" : "Add Study Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
