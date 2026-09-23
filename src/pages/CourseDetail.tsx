import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Archive, ArchiveRestore, CheckSquare, FileText, BarChart3, Plus, Calendar } from "lucide-react";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { TaskCard } from "@/components/TaskCard";
import { toast } from "sonner";
import { useReadings, Reading } from "@/hooks/useReadings";
import { useCourse, useToggleCourseArchive } from "@/hooks/useCourses";
import { useCourseTasks, useMarkTaskDone } from "@/hooks/useTasks";
import { ReadingsList } from "@/components/readings/ReadingsList";
import { CreateReadingDialog } from "@/components/readings/CreateReadingDialog";
import { CourseExamsTab } from "@/components/course/CourseExamsTab";
import { CourseStatsTab } from "@/components/course/CourseStatsTab";
import { formatTimeOfDay } from "@/lib/dateUtils";

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { timezone } = useUserTimezone();
  const { data: course, isLoading: courseLoading, isError: courseError } = useCourse(id);
  const { data: tasks = [], isLoading: tasksLoading } = useCourseTasks(id);
  const markTaskDone = useMarkTaskDone();
  const toggleCourseArchive = useToggleCourseArchive();
  const [activeTab, setActiveTab] = useState("assignments");
  const [createReadingOpen, setCreateReadingOpen] = useState(false);

  const { readings, updateStatus, createReading, updateReading, deleteReading } = useReadings(id);
  const [editReading, setEditReading] = useState<Reading | null>(null);
  const [deleteReadingId, setDeleteReadingId] = useState<string | null>(null);

  useEffect(() => {
    if (courseError) {
      toast.error("Failed to load course");
      navigate("/courses");
    }
  }, [courseError, navigate]);

  const completeTask = async (taskId: string) => {
    try {
      await markTaskDone.mutateAsync(taskId);
      toast.success("Task completed!");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const toggleArchive = async () => {
    if (!course) return;
    try {
      await toggleCourseArchive.mutateAsync({ courseId: course.id, archive: !course.is_archived });
      toast.success(course.is_archived ? "Course unarchived" : "Course archived");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const handleDeleteReading = async () => {
    if (deleteReadingId) {
      await deleteReading(deleteReadingId);
      setDeleteReadingId(null);
    }
  };

  if (courseLoading || tasksLoading || !course) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  const activeReadings = readings.filter(r => r.status !== "done").length;
  const activeTasks = tasks.filter(t => t.type !== "exam_prep").length;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Button aria-label="Back to courses" variant="ghost" size="icon" onClick={() => navigate("/courses")} className="self-start">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: course.color }}
              />
              <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight break-words">{course.name}</h1>
              <span className="text-sm sm:text-base text-muted-foreground whitespace-nowrap">
                ({course.short_code})
              </span>
              {course.is_archived && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  ARCHIVED
                </span>
              )}
            </div>
            {(course.semester || course.class_time) && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {[course.semester, course.class_time && `Class at ${formatTimeOfDay(course.class_time)}`].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleArchive}
            className="w-full sm:w-auto"
          >
            {course.is_archived ? (
              <>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Unarchive
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </>
            )}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="assignments" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 sm:px-3">
              <CheckSquare className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Assignments</span>
              {activeTasks > 0 && (
                <span className="hidden sm:inline text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {activeTasks}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="readings" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 sm:px-3">
              <FileText className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Readings</span>
              {activeReadings > 0 && (
                <span className="hidden sm:inline text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {activeReadings}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="exams" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 sm:px-3">
              <Calendar className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Exams</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 sm:px-3">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Stats</span>
            </TabsTrigger>
          </TabsList>

          {/* Assignments Tab */}
          <TabsContent value="assignments">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Active Assignments</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {activeTasks} active assignment{activeTasks !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => navigate("/assignments")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                {tasks.filter(t => t.type !== "exam_prep").length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No active assignments</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.filter(t => t.type !== "exam_prep").map((task) => (
                      <TaskCard key={task.id} task={task} onComplete={completeTask} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Readings Tab */}
          <TabsContent value="readings">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Readings</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {activeReadings} reading{activeReadings !== 1 ? 's' : ''} to complete
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setCreateReadingOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <ReadingsList
                  readings={readings}
                  onStatusChange={updateStatus}
                  onEdit={setEditReading}
                  onDelete={setDeleteReadingId}
                  showCourse={false}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams">
            <CourseExamsTab courseId={id!} courseName={course.name} timezone={timezone} />
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats">
            <CourseStatsTab courseId={id!} courseName={course.name} />
          </TabsContent>
        </Tabs>

        {/* Reading dialogs */}
        <CreateReadingDialog
          open={createReadingOpen || !!editReading}
          onOpenChange={(open) => {
            if (!open) {
              setCreateReadingOpen(false);
              setEditReading(null);
            }
          }}
          onSubmit={createReading}
          onUpdate={updateReading}
          courses={[{ id: course.id, name: course.name, short_code: course.short_code }]}
          defaultCourseId={course.id}
          editReading={editReading}
        />
      </div>
    </Layout>
  );
}
