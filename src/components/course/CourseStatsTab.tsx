import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, FileText, Calendar, TrendingUp } from "lucide-react";

interface CourseStatsTabProps {
  courseId: string;
  courseName: string;
}

interface Stats {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  totalReadings: number;
  completedReadings: number;
  activeReadings: number;
  upcomingExams: number;
  pastExams: number;
}

export function CourseStatsTab({ courseId, courseName }: CourseStatsTabProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (!user) return;

      const now = new Date();

      // Parallel fetches for all stats
      const [
        tasksResult,
        readingsResult,
        examsResult,
      ] = await Promise.all([
        // Tasks
        supabase
          .from("tasks")
          .select("status")
          .eq("user_id", user.id)
          .eq("course_id", courseId),
        // Readings
        supabase
          .from("readings")
          .select("status")
          .eq("user_id", user.id)
          .eq("course_id", courseId),
        // Exams
        supabase
          .from("exams")
          .select("exam_at")
          .eq("user_id", user.id)
          .eq("course_id", courseId),
      ]);

      const tasks = tasksResult.data || [];
      const readings = readingsResult.data || [];
      const exams = examsResult.data || [];

      setStats({
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t.status === "done").length,
        activeTasks: tasks.filter((t) => t.status !== "done").length,
        totalReadings: readings.length,
        completedReadings: readings.filter((r) => r.status === "done").length,
        activeReadings: readings.filter((r) => r.status !== "done").length,
        upcomingExams: exams.filter((e) => new Date(e.exam_at) >= now).length,
        pastExams: exams.filter((e) => new Date(e.exam_at) < now).length,
      });

      setLoading(false);
    };

    loadStats();
  }, [user, courseId]);

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

  if (!stats) return null;

  const taskCompletionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0;

  const readingCompletionRate = stats.totalReadings > 0 
    ? Math.round((stats.completedReadings / stats.totalReadings) * 100) 
    : 0;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={CheckCircle2}
          label="Assignments"
          value={`${stats.completedTasks}/${stats.totalTasks}`}
          subtext={`${taskCompletionRate}% complete`}
          iconColor="text-success"
        />
        <StatCard
          icon={FileText}
          label="Readings"
          value={`${stats.completedReadings}/${stats.totalReadings}`}
          subtext={`${readingCompletionRate}% complete`}
          iconColor="text-info"
        />
        <StatCard
          icon={Calendar}
          label="Exams"
          value={stats.upcomingExams.toString()}
          subtext={`upcoming (${stats.pastExams} past)`}
          iconColor="text-warning"
        />
      </div>

      {/* Activity Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bars */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Assignment Progress</span>
                <span className="text-muted-foreground">{taskCompletionRate}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${taskCompletionRate}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Reading Progress</span>
                <span className="text-muted-foreground">{readingCompletionRate}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all" 
                  style={{ width: `${readingCompletionRate}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext, 
  iconColor 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string; 
  subtext: string; 
  iconColor: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-muted ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
