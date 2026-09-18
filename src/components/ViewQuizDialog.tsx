import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CourseChip } from "@/components/CourseChip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatInTimezone, parseInTimezone } from "@/lib/dateUtils";
import { Calendar, Edit2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Quiz } from "@/hooks/useQuizzes";

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface ViewQuizDialogProps {
  quiz: Quiz | null;
  courses: Course[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  timezone: string;
}

export function ViewQuizDialog({ quiz, courses, open, onOpenChange, onSuccess, timezone }: ViewQuizDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [formData, setFormData] = useState({
    courseId: "",
    title: "",
    quizDate: "",
    quizTime: "09:00",
    topics: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startEditing = () => {
    if (quiz) {
      setFormData({
        courseId: quiz.course.id,
        title: quiz.title,
        quizDate: formatInTimezone(quiz.quiz_at, "yyyy-MM-dd", timezone),
        quizTime: formatInTimezone(quiz.quiz_at, "HH:mm", timezone),
        topics: quiz.topics || "",
      });
      setIsEditing(true);
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;

    setIsSubmitting(true);

    const quizAt = parseInTimezone(formData.quizDate, formData.quizTime, timezone);

    const { error } = await supabase
      .from("quizzes")
      .update({
        course_id: formData.courseId,
        title: formData.title,
        quiz_at: quizAt,
        topics: formData.topics || null,
      })
      .eq("id", quiz.id);

    setIsSubmitting(false);

    if (error) {
      console.error("Quiz update error:", error);
      toast.error("Failed to update quiz: " + error.message);
      return;
    }

    toast.success("Quiz updated!");
    setIsEditing(false);
    onSuccess();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!quiz) return;

    // Unlink any study items pointing at this quiz before removing it.
    await supabase.from("study_items").update({ quiz_id: null }).eq("quiz_id", quiz.id);

    const { error } = await supabase.from("quizzes").delete().eq("id", quiz.id);

    if (error) {
      toast.error("Failed to delete quiz");
    } else {
      toast.success("Quiz deleted");
      setShowDeleteAlert(false);
      onOpenChange(false);
      onSuccess();
    }
  };

  if (!quiz) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Quiz" : "Quiz Details"}</DialogTitle>
          </DialogHeader>

          {isEditing ? (
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
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{quiz.title}</h3>
                <CourseChip shortCode={quiz.course.short_code} color={quiz.course.color} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {formatInTimezone(quiz.quiz_at, "EEEE, MMMM d, yyyy 'at' h:mm a", timezone)}
                </div>
              </div>

              {quiz.topics && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Topics</h4>
                  <p className="text-sm text-muted-foreground">{quiz.topics}</p>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteAlert(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button onClick={startEditing}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quiz</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{quiz.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
