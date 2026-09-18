import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, CheckSquare, Clock, AlertCircle } from "lucide-react";
import { EditTaskDialog } from "@/components/EditTaskDialog";
import { useAuth } from "@/contexts/AuthContext";
import { TaskCard } from "@/components/TaskCard";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Task, taskKeys, useTasks, useMarkTaskDone } from "@/hooks/useTasks";
import { useCourses } from "@/hooks/useCourses";

export default function Tasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: allCourses = [] } = useCourses();
  const courses = allCourses.filter((c) => !c.is_archived);
  const markTaskDone = useMarkTaskDone();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const completeTask = async (taskId: string) => {
    try {
      await markTaskDone.mutateAsync(taskId);
      toast.success("Task completed!");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const handleSaveTask = async () => {
    setDialogOpen(false);
    setEditDialogOpen(false);
    if (user) queryClient.invalidateQueries({ queryKey: taskKeys.all(user.id) });
  };

  const handleEditTask = (task: Task) => {
    setEditTask(task);
    setEditDialogOpen(true);
  };

  // Group tasks by course
  const tasksByCourse = tasks.reduce((acc, task) => {
    const courseId = task.course?.id || "no-course";
    const courseName = task.course?.name || "No Course";
    if (!acc[courseId]) {
      acc[courseId] = {
        courseName,
        courseColor: task.course?.color,
        courseShortCode: task.course?.short_code,
        tasks: []
      };
    }
    acc[courseId].tasks.push(task);
    return acc;
  }, {} as Record<string, { courseName: string; courseColor?: string; courseShortCode?: string; tasks: typeof tasks }>);

  const courseEntries = Object.entries(tasksByCourse);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Assignments
            </h1>
            <p className="text-muted-foreground mt-1">
              {tasks.length} active {tasks.length === 1 ? 'assignment' : 'assignments'}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => setDialogOpen(true)} 
              className="gap-2 rounded-xl h-10"
            >
              <Plus className="h-4 w-4" />
              Add Assignment
            </Button>
          </div>
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
              <CheckSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{tasks.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-info/10">
              <Clock className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{courseEntries.length}</p>
              <p className="text-xs text-muted-foreground">Courses</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1"
          >
            <div className="p-2.5 rounded-xl bg-warning/10">
              <AlertCircle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {tasks.filter(t => new Date(t.due_at) < new Date()).length}
              </p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </motion.div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : tasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <CheckSquare className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No assignments yet</h3>
            <p className="text-muted-foreground mb-6">
              Click "Add Assignment" to create your first task
            </p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Add Assignment
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {courseEntries.map(([courseId, { courseName, courseColor, courseShortCode, tasks: courseTasks }], index) => (
              <motion.div
                key={courseId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, ease: EASE_OUT }}
                className={cn(
                  "col-span-12 glass-strong rounded-2xl overflow-hidden",
                  courseEntries.length === 1 ? "" : "lg:col-span-6"
                )}
              >
                {/* Course Header */}
                <div className="p-4 border-b border-border/30 flex items-center gap-3">
                  <div 
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: courseColor || 'hsl(var(--muted))' }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{courseName}</h3>
                    <p className="text-xs text-muted-foreground">
                      {courseShortCode} • {courseTasks.length} {courseTasks.length === 1 ? 'task' : 'tasks'}
                    </p>
                  </div>
                </div>

                {/* Tasks */}
                <div className="p-3 space-y-2">
                  {courseTasks.map((task) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onComplete={completeTask}
                      onEdit={handleEditTask}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <EditTaskDialog
          task={null}
          courses={courses}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleSaveTask}
        />

        <EditTaskDialog
          task={editTask}
          courses={courses}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={handleSaveTask}
        />
      </div>
    </Layout>
  );
}
