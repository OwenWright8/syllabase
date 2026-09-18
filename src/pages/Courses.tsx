import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Course, courseKeys, useCourses, useCreateCourse, useToggleCourseArchive } from "@/hooks/useCourses";
import { EditCourseDialog } from "@/components/EditCourseDialog";
import { Plus, Edit, Archive, ArchiveRestore, GraduationCap, BookOpen, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const colorOptions = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export default function Courses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: courses = [], isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const toggleCourseArchive = useToggleCourseArchive();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    shortCode: "",
    color: colorOptions[0],
    semester: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createCourse.mutateAsync({
        name: formData.name,
        short_code: formData.shortCode,
        color: formData.color,
        semester: formData.semester || null,
      });
      toast.success("Course created successfully");
      setDialogOpen(false);
      setFormData({
        name: "",
        shortCode: "",
        color: colorOptions[0],
        semester: "",
      });
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const handleEditSuccess = () => {
    if (user) queryClient.invalidateQueries({ queryKey: courseKeys.all(user.id) });
  };

  const toggleArchive = async (courseId: string, currentStatus: boolean) => {
    if (!currentStatus && !confirm("Are you sure you want to archive this course? It will be hidden from your active courses and assignments.")) {
      return;
    }

    try {
      await toggleCourseArchive.mutateAsync({ courseId, archive: !currentStatus });
      toast.success(currentStatus ? "Course unarchived" : "Course archived");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const activeCourses = courses.filter((c) => !c.is_archived);
  const archivedCourses = courses.filter((c) => c.is_archived);

  if (isLoading) {
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
              Courses
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your courses for this semester
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl h-10">
                <Plus className="h-4 w-4" />
                New Course
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong border-border/50">
              <DialogHeader>
                <DialogTitle>Create New Course</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Course Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g. General Chemistry"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="shortCode">Short Code *</Label>
                  <Input
                    id="shortCode"
                    placeholder="e.g. CHEM 111"
                    value={formData.shortCode}
                    onChange={(e) => setFormData({ ...formData, shortCode: e.target.value })}
                    className="mt-1 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="semester">Semester</Label>
                  <Input
                    id="semester"
                    placeholder="e.g. Spring 2024"
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="mt-1 rounded-xl"
                  />
                </div>

                <div>
                  <Label>Color *</Label>
                  <div className="flex gap-2 mt-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={cn(
                          "w-10 h-10 rounded-full transition-all",
                          formData.color === color 
                            ? "ring-4 ring-ring scale-110" 
                            : "hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-xl">
                    Create Course
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeCourses.length}</p>
              <p className="text-xs text-muted-foreground">Active Courses</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-muted/50">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{archivedCourses.length}</p>
              <p className="text-xs text-muted-foreground">Archived</p>
            </div>
          </motion.div>
        </div>

        {/* Course Grid */}
        {activeCourses.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No active courses yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your first course to get started
            </p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              New Course
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {activeCourses.map((course, index) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, ease: EASE_OUT }}
                className="col-span-12 sm:col-span-6 lg:col-span-4"
              >
                <div
                  className="glass-strong rounded-2xl p-5 cursor-pointer group hover:shadow-soft-lg transition-all duration-300"
                  onClick={() => navigate(`/courses/${course.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="h-4 w-4 rounded-full shrink-0"
                          style={{ backgroundColor: course.color }}
                        />
                        <h3 className="font-bold text-lg text-foreground truncate">
                          {course.short_code}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-1">
                        {course.name}
                      </p>
                      {course.semester && (
                        <p className="text-xs text-muted-foreground/60">
                          {course.semester}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditCourse(course);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => toggleArchive(course.id, course.is_archived)}
                        title="Archive course"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">View details</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Archived Courses */}
        {archivedCourses.length > 0 && (
          <div className="pt-4">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <span className="text-sm font-medium">
                Archived Courses ({archivedCourses.length})
              </span>
              <ChevronRight className={cn(
                "h-4 w-4 transition-transform",
                showArchived && "rotate-90"
              )} />
            </button>

            {showArchived && (
              <div className="grid grid-cols-12 gap-4">
                {archivedCourses.map((course, index) => (
                  <motion.div
                    key={course.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, ease: EASE_OUT }}
                    className="col-span-12 sm:col-span-6 lg:col-span-4"
                  >
                    <div
                      className="glass-strong rounded-2xl p-5 cursor-pointer group opacity-60 hover:opacity-100 transition-all duration-300"
                      onClick={() => navigate(`/courses/${course.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="h-4 w-4 rounded-full shrink-0"
                              style={{ backgroundColor: course.color }}
                            />
                            <h3 className="font-bold text-lg text-foreground truncate">
                              {course.short_code}
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              Archived
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {course.name}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => {
                              setEditCourse(course);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => toggleArchive(course.id, course.is_archived)}
                            title="Unarchive course"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {editCourse && (
          <EditCourseDialog
            course={editCourse}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSuccess={handleEditSuccess}
          />
        )}
      </div>
    </Layout>
  );
}
