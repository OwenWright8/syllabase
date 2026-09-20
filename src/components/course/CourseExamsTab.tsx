import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Calendar, BookOpen, Edit2, Trash2 } from "lucide-react";
import { formatInTimezone, parseInTimezone } from "@/lib/dateUtils";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

interface CourseExamsTabProps {
  courseId: string;
  courseName: string;
  timezone: string;
}

export function CourseExamsTab({ courseId, courseName, timezone }: CourseExamsTabProps) {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editExam, setEditExam] = useState<Exam | null>(null);
  const [deleteExamId, setDeleteExamId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    examDate: "",
    examTime: "09:00",
    chapters: "",
    topics: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadExams = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .order("exam_at", { ascending: true });

    if (error) {
      toast.error("Failed to load exams");
    } else {
      setExams(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadExams();
  }, [user, courseId]);

  const resetForm = () => {
    setFormData({
      title: "",
      examDate: "",
      examTime: "09:00",
      chapters: "",
      topics: "",
    });
    setEditExam(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (exam: Exam) => {
    setFormData({
      title: exam.title,
      examDate: formatInTimezone(exam.exam_at, "yyyy-MM-dd", timezone),
      examTime: formatInTimezone(exam.exam_at, "HH:mm", timezone),
      chapters: exam.chapters || "",
      topics: exam.topics || "",
    });
    setEditExam(exam);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    const examAt = parseInTimezone(formData.examDate, formData.examTime, timezone);

    if (editExam) {
      const { error } = await supabase
        .from("exams")
        .update({
          title: formData.title,
          exam_at: examAt,
          chapters: formData.chapters || null,
          topics: formData.topics || null,
        })
        .eq("id", editExam.id);

      if (error) {
        toast.error("Failed to update exam");
      } else {
        toast.success("Exam updated!");
        loadExams();
      }
    } else {
      const { error } = await supabase.from("exams").insert({
        user_id: user.id,
        course_id: courseId,
        title: formData.title,
        exam_at: examAt,
        chapters: formData.chapters || null,
        topics: formData.topics || null,
        study_days_before: 0,
      });

      if (error) {
        toast.error("Failed to create exam");
      } else {
        toast.success("Exam added!");
        loadExams();
      }
    }

    setIsSubmitting(false);
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteExamId) return;

    // Delete related tasks
    await supabase.from("tasks").delete().eq("exam_id", deleteExamId);

    const { error } = await supabase.from("exams").delete().eq("id", deleteExamId);

    if (error) {
      toast.error("Failed to delete exam");
    } else {
      toast.success("Exam deleted");
      loadExams();
    }
    setDeleteExamId(null);
  };

  const now = new Date();
  const upcomingExams = exams.filter(e => new Date(e.exam_at) >= now);
  const pastExams = exams.filter(e => new Date(e.exam_at) < now);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Exams</CardTitle>
              <p className="text-sm text-muted-foreground">
                {upcomingExams.length} upcoming exam{upcomingExams.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Exam
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
          {exams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No exams scheduled</p>
            </div>
          ) : (
            <>
              {upcomingExams.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground">Upcoming</h3>
                  {upcomingExams.map((exam) => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      timezone={timezone}
                      onEdit={() => openEditDialog(exam)}
                      onDelete={() => setDeleteExamId(exam.id)}
                    />
                  ))}
                </div>
              )}
              {pastExams.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground">Past</h3>
                  {pastExams.map((exam) => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      timezone={timezone}
                      onEdit={() => openEditDialog(exam)}
                      onDelete={() => setDeleteExamId(exam.id)}
                      isPast
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } else { setDialogOpen(true); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editExam ? "Edit Exam" : "Add Exam"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editExam ? "Save" : "Add Exam"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteExamId} onOpenChange={() => setDeleteExamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this exam? This action cannot be undone.
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

function ExamCard({ exam, timezone, onEdit, onDelete, isPast = false }: { 
  exam: Exam; 
  timezone: string; 
  onEdit: () => void; 
  onDelete: () => void;
  isPast?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium">{exam.title}</h4>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Calendar className="h-4 w-4" />
            {formatInTimezone(exam.exam_at, "EEE, MMM d 'at' h:mm a", timezone)}
          </div>
          {exam.chapters && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <BookOpen className="h-4 w-4" />
              Chapters {exam.chapters}
            </div>
          )}
          {exam.topics && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{exam.topics}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label={`Edit ${exam.title}`} variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button aria-label={`Delete ${exam.title}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
