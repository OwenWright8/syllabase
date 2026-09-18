import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CourseChip } from "@/components/CourseChip";
import { TaskTypeLabel } from "@/components/TaskTypeLabel";
import { Calendar, Clock, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimezone } from "@/lib/dateUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  due_at: string;
  completed_at: string | null;
  course: {
    id: string;
    short_code: string;
    color: string;
  } | null;
}

interface Course {
  id: string;
  name: string;
  short_code: string;
}

export default function Archive() {
  const { user } = useAuth();
  const { timezone } = useUserTimezone();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const deleteOldArchivedTasks = async () => {
    if (!user) return;

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("user_id", user.id)
      .eq("status", "done")
      .lt("completed_at", twoWeeksAgo.toISOString());

    if (error) {
      console.error("Failed to delete old archived tasks:", error);
    }
  };

  const loadCompletedTasks = async () => {
    if (!user) return;

    // First, delete tasks archived for over 2 weeks
    await deleteOldArchivedTasks();

    const { data, error } = await supabase
      .from("tasks")
      .select(
        `
        *,
        course:courses (
          id,
          short_code,
          color
        )
      `
      )
      .eq("user_id", user.id)
      .eq("status", "done")
      .order("completed_at", { ascending: false });

    if (error) {
      toast.error("Failed to load completed tasks");
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  };

  const loadCourses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (error) {
      toast.error("Failed to load courses");
    } else {
      setCourses(data || []);
    }
  };

  useEffect(() => {
    loadCompletedTasks();
    loadCourses();
  }, [user]);

  const unarchiveTask = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "not_started", completed_at: null })
      .eq("id", taskId);

    if (error) {
      toast.error("Failed to restore task");
    } else {
      toast.success("Task restored!");
      loadCompletedTasks();
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filterCourse !== "all" && task.course?.id !== filterCourse) return false;
    if (filterType !== "all" && task.type !== filterType) return false;
    return true;
  });

  const isLate = (task: Task) => {
    if (!task.completed_at) return false;
    return parseISO(task.completed_at) > parseISO(task.due_at);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Archive</h1>
          <p className="text-muted-foreground">View your completed tasks</p>
        </div>

        <div className="flex gap-4">
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.short_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="homework">Homework</SelectItem>
              <SelectItem value="reading">Reading</SelectItem>
              <SelectItem value="lab">Lab</SelectItem>
              <SelectItem value="exam_prep">Exam Prep</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-lg text-muted-foreground">No completed tasks yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                {filterCourse !== "all" || filterType !== "all"
                  ? "Try adjusting your filters"
                  : "Start completing tasks to see them here"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const late = isLate(task);
              return (
                <Card key={task.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-medium">{task.title}</h3>
                          {task.course && (
                            <CourseChip shortCode={task.course.short_code} color={task.course.color} />
                          )}
                          <TaskTypeLabel type={task.type} />
                          {late ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive font-medium flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Completed Late
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              On Time
                            </span>
                          )}
                        </div>

                        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Due: {formatInTimezone(task.due_at, "MMM d, yyyy 'at' h:mm a", timezone)}
                          </div>
                          {task.completed_at && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              Completed: {formatInTimezone(task.completed_at, "MMM d, yyyy 'at' h:mm a", timezone)}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unarchiveTask(task.id)}
                        className="flex items-center gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
