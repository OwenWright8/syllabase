import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useCourses } from "@/hooks/useCourses";
import { examKeys, useExams } from "@/hooks/useExams";
import { quizKeys, useQuizzes } from "@/hooks/useQuizzes";
import { useReadings } from "@/hooks/useReadings";
import { useStudyItems } from "@/hooks/useStudyItems";
import { taskKeys } from "@/hooks/useTasks";
import { EditTaskDialog } from "@/components/EditTaskDialog";
import { CreateExamDialog } from "@/components/CreateExamDialog";
import { CreateQuizDialog } from "@/components/CreateQuizDialog";
import { CreateCourseDialog } from "@/components/CreateCourseDialog";
import { CreateReadingDialog } from "@/components/readings/CreateReadingDialog";
import { CreateStudyItemDialog } from "@/components/study/CreateStudyItemDialog";
import type { QuickAddKind } from "./FloatingActionButton";

interface QuickAddDialogsProps {
  /** Which create form is open, or null for none. */
  active: QuickAddKind | null;
  onClose: () => void;
  /**
   * A day (YYYY-MM-DD) to plan for when the user is looking at one ahead of
   * today: assignments are planned for it, exams and quizzes pre-fill it.
   * Leave undefined for today or a past day, which keep the normal defaults.
   */
  defaultDate?: string;
}

// The create forms behind the Today page's "+" menu, opened in place so adding
// something doesn't take you off the page. They're the same dialogs the
// Assignments / Readings / Study / Exams / Courses pages use, and each one
// invalidates the queries the Today page reads from when it saves, so the new
// item shows up here straight away.
export function QuickAddDialogs({ active, onClose, defaultDate }: QuickAddDialogsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { timezone } = useUserTimezone();
  const { data: allCourses = [] } = useCourses();
  const courses = useMemo(() => allCourses.filter((c) => !c.is_archived), [allCourses]);
  const { data: exams = [] } = useExams();
  const { data: quizzes = [] } = useQuizzes();
  const { createReading } = useReadings();
  const { createStudyItem } = useStudyItems();

  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const refreshTasks = () => {
    if (user) queryClient.invalidateQueries({ queryKey: taskKeys.all(user.id) });
  };

  const refreshExams = () => {
    if (user) queryClient.invalidateQueries({ queryKey: examKeys.all(user.id) });
  };

  const refreshQuizzes = () => {
    if (user) queryClient.invalidateQueries({ queryKey: quizKeys.all(user.id) });
  };

  return (
    <>
      <EditTaskDialog
        task={null}
        courses={courses}
        open={active === "assignment"}
        onOpenChange={onOpenChange}
        onSuccess={refreshTasks}
        defaultDate={defaultDate}
      />

      <CreateReadingDialog
        open={active === "reading"}
        onOpenChange={onOpenChange}
        onSubmit={createReading}
        courses={courses}
      />

      <CreateStudyItemDialog
        open={active === "study"}
        onOpenChange={onOpenChange}
        onSubmit={createStudyItem}
        courses={courses}
        exams={exams}
        quizzes={quizzes}
      />

      <CreateExamDialog
        courses={courses}
        open={active === "exam"}
        onOpenChange={onOpenChange}
        onSuccess={refreshExams}
        timezone={timezone}
        defaultDate={defaultDate}
      />

      <CreateQuizDialog
        courses={courses}
        open={active === "quiz"}
        onOpenChange={onOpenChange}
        onSuccess={refreshQuizzes}
        timezone={timezone}
        defaultDate={defaultDate}
      />

      <CreateCourseDialog open={active === "course"} onOpenChange={onOpenChange} />
    </>
  );
}
