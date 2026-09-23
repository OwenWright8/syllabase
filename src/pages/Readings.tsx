import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useReadings, Reading } from "@/hooks/useReadings";
import { useCourses } from "@/hooks/useCourses";
import { useReadingTasks, useUpdateTaskStatus } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { ReadingsList } from "@/components/readings/ReadingsList";
import { CreateReadingDialog } from "@/components/readings/CreateReadingDialog";
import { Plus, BookOpen, CheckCircle2, BookMarked } from "lucide-react";
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

export default function Readings() {
  const { user } = useAuth();
  const { readings, loading, createReading, updateReading, updateStatus, deleteReading } = useReadings();
  const { data: allCourses = [] } = useCourses();
  const courses = allCourses.filter((c) => !c.is_archived);
  const { data: readingTasks = [], isLoading: tasksLoading } = useReadingTasks();
  const updateTaskStatus = useUpdateTaskStatus();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editReading, setEditReading] = useState<Reading | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteReading(deleteId);
      setDeleteId(null);
    }
  };

  const handleTaskStatusChange = async (taskId: string, status: "not_started" | "in_progress" | "done") => {
    await updateTaskStatus.mutateAsync({ taskId, status });
  };

  // Convert reading tasks to Reading format for display
  const tasksAsReadings: Reading[] = useMemo(() => {
    return readingTasks.map((task) => ({
      id: task.id,
      user_id: user?.id || "",
      course_id: task.course_id || "",
      title: task.title,
      pages: null,
      due_date: task.due_at ? task.due_at.split("T")[0] : null,
      status: (task.status === "done" ? "done" : task.status === "in_progress" ? "in_progress" : "not_started") as Reading["status"],
      completed_at: task.completed_at,
      flashcard_deck_id: null,
      task_id: task.id, // Mark as a task-based reading
      exam_id: null,
      planned_date: null,
      plan_order: null,
      document_id: null,
      start_page: null,
      end_page: null,
      created_at: "",
      updated_at: "",
      course: task.course || undefined,
      isTask: true, // Flag to identify task-based readings
    }));
  }, [readingTasks, user]);

  // Combine readings and reading tasks
  const allReadings = useMemo(() => {
    return [...readings, ...tasksAsReadings];
  }, [readings, tasksAsReadings]);

  // Group readings by course
  const readingsByCourse = allReadings.reduce((acc, reading) => {
    const courseId = reading.course_id;
    if (!acc[courseId]) {
      acc[courseId] = {
        course: reading.course,
        readings: [],
      };
    }
    acc[courseId].readings.push(reading);
    return acc;
  }, {} as Record<string, { course: Reading["course"]; readings: Reading[] }>);

  const activeReadingsCount = allReadings.filter((r) => r.status !== "done").length;
  const completedReadingsCount = allReadings.filter((r) => r.status === "done").length;
  const courseEntries = Object.entries(readingsByCourse);

  // Custom status change handler that routes to correct update function
  const handleStatusChange = (id: string, status: Reading["status"]) => {
    // Check if this is a task-based reading
    const isTask = readingTasks.some((t) => t.id === id);
    if (isTask) {
      handleTaskStatusChange(id, status);
    } else {
      updateStatus(id, status);
    }
  };

  if (loading || tasksLoading) {
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
              Readings
            </h1>
            {activeReadingsCount > 0 && (
              <p className="text-muted-foreground mt-1">
                {activeReadingsCount} reading{activeReadingsCount !== 1 ? "s" : ""} to complete
              </p>
            )}
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl h-10">
            <Plus className="h-4 w-4" />
            Add Reading
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
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeReadingsCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
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
              <p className="text-2xl font-bold text-foreground">{completedReadingsCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1"
          >
            <div className="p-2.5 rounded-xl bg-info/10">
              <BookMarked className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{courseEntries.length}</p>
              <p className="text-xs text-muted-foreground">Courses</p>
            </div>
          </motion.div>
        </div>

        {/* Content */}
        {allReadings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No readings tracked yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Keep track of your assigned readings and mark them as you go
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Add Your First Reading
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {courseEntries.map(([courseId, { course, readings: courseReadings }], index) => (
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
                      {course?.name || "Unknown Course"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {courseReadings.filter((r) => r.status !== "done").length} active
                    </p>
                  </div>
                </div>

                {/* Readings */}
                <div className="p-3">
                  <ReadingsList
                    readings={courseReadings}
                    onStatusChange={handleStatusChange}
                    onEdit={setEditReading}
                    onDelete={setDeleteId}
                    showCourse={false}
                    showFilters={false}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <CreateReadingDialog
          open={createDialogOpen || !!editReading}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogOpen(false);
              setEditReading(null);
            }
          }}
          onSubmit={createReading}
          onUpdate={updateReading}
          courses={courses}
          editReading={editReading}
        />

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="glass-strong border-border/50">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Reading</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this reading? This action cannot be undone.
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
