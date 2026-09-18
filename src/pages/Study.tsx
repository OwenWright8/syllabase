import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useStudyItems, StudyItem } from "@/hooks/useStudyItems";
import { useCourses } from "@/hooks/useCourses";
import { useExams } from "@/hooks/useExams";
import { useQuizzes } from "@/hooks/useQuizzes";
import { StudyItemsList } from "@/components/study/StudyItemsList";
import { CreateStudyItemDialog } from "@/components/study/CreateStudyItemDialog";
import { Plus, BrainCircuit, CheckCircle2, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";
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

export default function Study() {
  const { studyItems, loading, createStudyItem, updateStudyItem, updateStatus, deleteStudyItem } = useStudyItems();
  const { data: allCourses = [] } = useCourses();
  const courses = allCourses.filter((c) => !c.is_archived);
  const { data: exams = [] } = useExams();
  const { data: quizzes = [] } = useQuizzes();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StudyItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteStudyItem(deleteId);
      setDeleteId(null);
    }
  };

  // Group study items by course, "No Course" last.
  const itemsByCourse = studyItems.reduce((acc, item) => {
    const courseId = item.course?.id || "no-course";
    if (!acc[courseId]) {
      acc[courseId] = { course: item.course, items: [] as StudyItem[] };
    }
    acc[courseId].items.push(item);
    return acc;
  }, {} as Record<string, { course: StudyItem["course"]; items: StudyItem[] }>);

  const courseEntries = Object.entries(itemsByCourse).sort(([a], [b]) => {
    if (a === "no-course") return 1;
    if (b === "no-course") return -1;
    return 0;
  });

  const activeCount = studyItems.filter((i) => i.status !== "done").length;
  const doneCount = studyItems.filter((i) => i.status === "done").length;
  const linkedCount = studyItems.filter((i) => i.exam_id || i.quiz_id).length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Study
            </h1>
            <p className="text-muted-foreground mt-1">
              Track the things you know you need to study for
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl h-10">
            <Plus className="h-4 w-4" />
            Add Study Item
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-primary/10">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeCount}</p>
              <p className="text-xs text-muted-foreground">To Study</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{doneCount}</p>
              <p className="text-xs text-muted-foreground">Studied</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1"
          >
            <div className="p-2.5 rounded-xl bg-info/10">
              <GraduationCap className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{linkedCount}</p>
              <p className="text-xs text-muted-foreground">Linked to Exam/Quiz</p>
            </div>
          </motion.div>
        </div>

        {/* Content */}
        {studyItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <BrainCircuit className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nothing to study yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Add topics you know you'll need to review, and optionally link them to an exam or quiz
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Add Your First Study Item
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {courseEntries.map(([courseId, { course, items }], index) => (
              <motion.div
                key={courseId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, ease: EASE_OUT }}
                className="col-span-12 lg:col-span-6 glass-strong rounded-2xl overflow-hidden"
              >
                {/* Course Header */}
                <div className="p-4 border-b border-border/30 flex items-center gap-3">
                  {course && (
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: course.color }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {course?.name || "No Course"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {items.filter((i) => i.status !== "done").length} active
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="p-3">
                  <StudyItemsList
                    items={items}
                    onStatusChange={updateStatus}
                    onEdit={setEditItem}
                    onDelete={setDeleteId}
                    showCourse={false}
                    showFilters={false}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <CreateStudyItemDialog
          open={createDialogOpen || !!editItem}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogOpen(false);
              setEditItem(null);
            }
          }}
          onSubmit={createStudyItem}
          onUpdate={updateStudyItem}
          courses={courses}
          exams={exams}
          quizzes={quizzes}
          editItem={editItem}
        />

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="glass-strong border-border/50">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Study Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this study item? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
