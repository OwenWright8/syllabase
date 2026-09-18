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
import { Calendar, BookOpen, Edit2, Trash2 } from "lucide-react";
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

interface Exam {
  id: string;
  title: string;
  exam_at: string;
  chapters: string | null;
  topics: string | null;
  course: {
    id: string;
    short_code: string;
    color: string;
    name: string;
  };
}

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface ViewExamDialogProps {
  exam: Exam | null;
  courses: Course[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  timezone: string;
}

export function ViewExamDialog({ exam, courses, open, onOpenChange, onSuccess, timezone }: ViewExamDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [formData, setFormData] = useState({
    courseId: "",
    title: "",
    examDate: "",
    examTime: "09:00",
    chapters: "",
    topics: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when exam changes
  const startEditing = () => {
    if (exam) {
      setFormData({
        courseId: exam.course.id,
        title: exam.title,
        examDate: formatInTimezone(exam.exam_at, "yyyy-MM-dd", timezone),
        examTime: formatInTimezone(exam.exam_at, "HH:mm", timezone),
        chapters: exam.chapters || "",
        topics: exam.topics || "",
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
    if (!exam) return;

    setIsSubmitting(true);

    const examAt = parseInTimezone(formData.examDate, formData.examTime, timezone);

    const { error } = await supabase
      .from("exams")
      .update({
        course_id: formData.courseId,
        title: formData.title,
        exam_at: examAt,
        chapters: formData.chapters || null,
        topics: formData.topics || null,
      })
      .eq("id", exam.id);

    setIsSubmitting(false);

    if (error) {
      console.error("Exam update error:", error);
      toast.error("Failed to update exam: " + error.message);
      return;
    }

    toast.success("Exam updated!");
    setIsEditing(false);
    onSuccess();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!exam) return;

    // Delete related tasks first
    await supabase.from("tasks").delete().eq("exam_id", exam.id);

    const { error } = await supabase.from("exams").delete().eq("id", exam.id);

    if (error) {
      toast.error("Failed to delete exam");
    } else {
      toast.success("Exam deleted");
      setShowDeleteAlert(false);
      onOpenChange(false);
      onSuccess();
    }
  };

  if (!exam) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Exam" : "Exam Details"}</DialogTitle>
          </DialogHeader>

          {isEditing ? (
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
                />
              </div>

              <div>
                <Label htmlFor="topics">Topics</Label>
                <Textarea
                  id="topics"
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
                <h3 className="text-xl font-semibold">{exam.title}</h3>
                <CourseChip shortCode={exam.course.short_code} color={exam.course.color} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {formatInTimezone(exam.exam_at, "EEEE, MMMM d, yyyy 'at' h:mm a", timezone)}
                </div>
                {exam.chapters && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    Chapters {exam.chapters}
                  </div>
                )}
              </div>

              {exam.topics && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Topics</h4>
                  <p className="text-sm text-muted-foreground">{exam.topics}</p>
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
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{exam.title}"? This action cannot be undone.
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
