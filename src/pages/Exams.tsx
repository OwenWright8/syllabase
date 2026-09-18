import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ExamCalendar } from "@/components/ExamCalendar";
import { CreateExamDialog } from "@/components/CreateExamDialog";
import { ViewExamDialog } from "@/components/ViewExamDialog";
import { CreateQuizDialog } from "@/components/CreateQuizDialog";
import { ViewQuizDialog } from "@/components/ViewQuizDialog";
import { Plus, GraduationCap, CalendarDays, AlertCircle, ClipboardCheck } from "lucide-react";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { Exam, examKeys, useExams } from "@/hooks/useExams";
import { Quiz, quizKeys, useQuizzes } from "@/hooks/useQuizzes";
import { useCourses } from "@/hooks/useCourses";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";
import { differenceInDays } from "date-fns";

export default function Exams() {
  const { user } = useAuth();
  const { timezone } = useUserTimezone();
  const queryClient = useQueryClient();
  const { data: exams = [], isLoading } = useExams();
  const { data: quizzes = [], isLoading: quizzesLoading } = useQuizzes();
  const { data: allCourses = [] } = useCourses();
  const courses = allCourses.filter((c) => !c.is_archived);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [createQuizOpen, setCreateQuizOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [viewQuizOpen, setViewQuizOpen] = useState(false);

  const refreshExams = () => {
    if (user) queryClient.invalidateQueries({ queryKey: examKeys.all(user.id) });
  };

  const refreshQuizzes = () => {
    if (user) queryClient.invalidateQueries({ queryKey: quizKeys.all(user.id) });
  };

  const handleExamClick = (exam: Exam) => {
    setSelectedExam(exam);
    setViewDialogOpen(true);
  };

  const handleQuizClick = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setViewQuizOpen(true);
  };

  const now = new Date();
  const upcomingExams = exams.filter(e => new Date(e.exam_at) >= now);
  const pastExams = exams.filter(e => new Date(e.exam_at) < now);
  const urgentExams = upcomingExams.filter(e => differenceInDays(new Date(e.exam_at), now) <= 7);
  const upcomingQuizzes = quizzes.filter(q => new Date(q.quiz_at) >= now);

  if (isLoading || quizzesLoading) {
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
              Exam Calendar
            </h1>
            <p className="text-muted-foreground mt-1">
              Track and prepare for your upcoming exams
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCreateQuizOpen(true)} className="gap-2 rounded-xl h-10">
              <Plus className="h-4 w-4" />
              Add Quiz
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl h-10">
              <Plus className="h-4 w-4" />
              Add Exam
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              <p className="text-2xl font-bold text-foreground">{upcomingExams.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming Exams</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.13, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-warning/10">
              <ClipboardCheck className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{upcomingQuizzes.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming Quizzes</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{urgentExams.length}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE_OUT }}
            className="glass-strong rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-success/10">
              <CalendarDays className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pastExams.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </motion.div>
        </div>

        {/* Calendar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, ease: EASE_OUT }}
          className="glass-strong rounded-2xl p-4 sm:p-6"
        >
          <ExamCalendar
            exams={exams}
            quizzes={quizzes}
            timezone={timezone}
            onExamClick={handleExamClick}
            onQuizClick={handleQuizClick}
          />
        </motion.div>

        <CreateExamDialog
          courses={courses}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={refreshExams}
          timezone={timezone}
        />

        <ViewExamDialog
          exam={selectedExam}
          courses={courses}
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
          onSuccess={refreshExams}
          timezone={timezone}
        />

        <CreateQuizDialog
          courses={courses}
          open={createQuizOpen}
          onOpenChange={setCreateQuizOpen}
          onSuccess={refreshQuizzes}
          timezone={timezone}
        />

        <ViewQuizDialog
          quiz={selectedQuiz}
          courses={courses}
          open={viewQuizOpen}
          onOpenChange={setViewQuizOpen}
          onSuccess={refreshQuizzes}
          timezone={timezone}
        />
      </div>
    </Layout>
  );
}
