import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimezone, parseInTimezone, getTodayInTimezone } from "@/lib/dateUtils";

interface Course {
  id: string;
  name: string;
  short_code: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  type: string;
  due_at: string;
  work_date: string;
  estimated_minutes: number;
  priority: string;
}

interface EditTaskDialogProps {
  task: Task | null;
  courses: Course[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** New tasks only: the day (YYYY-MM-DD) to plan the work for, if not today. The due date defaults to the day after. */
  defaultDate?: string;
}

export function EditTaskDialog({ task, courses, open, onOpenChange, onSuccess, defaultDate }: EditTaskDialogProps) {
  const { timezone } = useUserTimezone();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    courseId: "none",
    type: "homework",
    dueDate: "",
    dueTime: "23:59",
    workDate: "",
    estimatedMinutes: "60",
    priority: "medium",
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || "",
        courseId: task.course_id || "none",
        type: task.type,
        dueDate: formatInTimezone(task.due_at, "yyyy-MM-dd", timezone),
        dueTime: formatInTimezone(task.due_at, "HH:mm", timezone),
        workDate: task.work_date,
        estimatedMinutes: task.estimated_minutes.toString(),
        priority: task.priority,
      });
    } else {
      // Reset form for new task
      const workDay = defaultDate ?? getTodayInTimezone(timezone);
      // parseISO reads a bare "yyyy-MM-dd" as a local calendar date. `new Date()`
      // would read it as UTC midnight, which is the previous evening anywhere
      // west of UTC and shifted these defaults back a day.
      // Due the day after the day it is planned for: tomorrow, unless a later day was chosen.
      const defaultDue = format(addDays(parseISO(workDay), 1), "yyyy-MM-dd");
      setFormData({
        title: "",
        description: "",
        courseId: "none",
        type: "homework",
        dueDate: defaultDue,
        dueTime: "23:59",
        workDate: "",
        estimatedMinutes: "60",
        priority: "medium",
      });
    }
  }, [task, open, timezone, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dueAt = parseInTimezone(formData.dueDate, formData.dueTime, timezone);
    
    // If work_date is empty, set it to the day before due_date
    let workDate = formData.workDate;
    if (!workDate) {
      const dayBefore = addDays(parseISO(formData.dueDate), -1);
      workDate = format(dayBefore, "yyyy-MM-dd");
    }

    if (task) {
      // Update existing task
      const { error } = await supabase
        .from("tasks")
        .update({
          course_id: formData.courseId === "none" ? null : formData.courseId,
          title: formData.title,
          description: formData.description || null,
          type: formData.type,
          due_at: dueAt,
          work_date: workDate,
          estimated_minutes: parseInt(formData.estimatedMinutes),
          priority: formData.priority,
        })
        .eq("id", task.id);

      if (error) {
        toast.error("Failed to update task");
      } else {
        toast.success("Task updated successfully");
        onOpenChange(false);
        onSuccess();
      }
    } else {
      // Create new task
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("You must be logged in to create tasks");
        return;
      }

      const { error } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          course_id: formData.courseId === "none" ? null : formData.courseId,
          title: formData.title,
          description: formData.description || null,
          type: formData.type,
          due_at: dueAt,
          work_date: workDate,
          estimated_minutes: parseInt(formData.estimatedMinutes),
          priority: formData.priority,
          status: "not_started",
        });

      if (error) {
        console.error("Create task error:", error);
        toast.error("Failed to create task");
      } else {
        toast.success("Task created successfully");
        onOpenChange(false);
        onSuccess();
      }
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm("Are you sure you want to delete this task?")) return;

    const { error } = await supabase.from("tasks").delete().eq("id", task.id);

    if (error) {
      toast.error("Failed to delete task");
    } else {
      toast.success("Task deleted");
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Add Assignment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="course">Course</Label>
              <Select value={formData.courseId} onValueChange={(v) => setFormData({ ...formData, courseId: v })}>
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

            <div>
              <Label htmlFor="type">Type *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reading">Reading</SelectItem>
                  <SelectItem value="homework">Homework</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                  <SelectItem value="quiz">Quiz</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="dueTime">Due Time *</Label>
              <Input
                id="dueTime"
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="workDate">Work Date</Label>
              <Input
                id="workDate"
                type="date"
                value={formData.workDate}
                onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="estimatedMinutes">Estimated Minutes</Label>
              <Input
                id="estimatedMinutes"
                type="number"
                min="1"
                value={formData.estimatedMinutes}
                onChange={(e) => setFormData({ ...formData, estimatedMinutes: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority *</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
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

            <div className="col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-between gap-2">
            {task && (
              <Button type="button" variant="destructive" onClick={handleDelete}>
                Delete Task
              </Button>
            )}
            {!task && <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{task ? "Save Changes" : "Add Assignment"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
