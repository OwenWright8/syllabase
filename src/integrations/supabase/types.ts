export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      awards: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          organization: string | null
          tags: string[] | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          organization?: string | null
          tags?: string[] | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          organization?: string | null
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          name: string
          semester: string | null
          short_code: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          name: string
          semester?: string | null
          short_code: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          name?: string
          semester?: string | null
          short_code?: string
          user_id?: string
        }
        Relationships: []
      }
      exams: {
        Row: {
          chapters: string | null
          course_id: string
          created_at: string | null
          exam_at: string
          id: string
          study_days_before: number | null
          title: string
          topics: string | null
          user_id: string
        }
        Insert: {
          chapters?: string | null
          course_id: string
          created_at?: string | null
          exam_at: string
          id?: string
          study_days_before?: number | null
          title: string
          topics?: string | null
          user_id: string
        }
        Update: {
          chapters?: string | null
          course_id?: string
          created_at?: string | null
          exam_at?: string
          id?: string
          study_days_before?: number | null
          title?: string
          topics?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          category: string
          created_at: string | null
          id: string
          target: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          target?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          target?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hour_entries: {
        Row: {
          attachment_url: string | null
          category: string
          clinical_procedures: string | null
          created_at: string | null
          date: string
          doctor_email: string | null
          doctor_name: string | null
          doctor_phone: string | null
          end_time: string
          hours: number
          id: string
          location: string | null
          notable: boolean | null
          reflection: string | null
          specialty: string | null
          start_time: string
          supervisor: string | null
          surgical_procedures: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
          verified: boolean | null
        }
        Insert: {
          attachment_url?: string | null
          category: string
          clinical_procedures?: string | null
          created_at?: string | null
          date: string
          doctor_email?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          end_time: string
          hours: number
          id?: string
          location?: string | null
          notable?: boolean | null
          reflection?: string | null
          specialty?: string | null
          start_time: string
          supervisor?: string | null
          surgical_procedures?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
          verified?: boolean | null
        }
        Update: {
          attachment_url?: string | null
          category?: string
          clinical_procedures?: string | null
          created_at?: string | null
          date?: string
          doctor_email?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          end_time?: string
          hours?: number
          id?: string
          location?: string | null
          notable?: boolean | null
          reflection?: string | null
          specialty?: string | null
          start_time?: string
          supervisor?: string | null
          surgical_procedures?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      image_config: {
        Row: {
          category: string
          created_at: string
          file_name: string
          id: string
          is_featured: boolean
          is_hero: boolean
          media_type: string
          orientation: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          id?: string
          is_featured?: boolean
          is_hero?: boolean
          media_type?: string
          orientation?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          id?: string
          is_featured?: boolean
          is_hero?: boolean
          media_type?: string
          orientation?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_projects: {
        Row: {
          approach: string[] | null
          category: string | null
          client: string | null
          created_at: string | null
          demo_url: string | null
          description: string | null
          display_order: number | null
          external_url: string | null
          featured: boolean | null
          id: string
          problem: string | null
          solution: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          year: string | null
        }
        Insert: {
          approach?: string[] | null
          category?: string | null
          client?: string | null
          created_at?: string | null
          demo_url?: string | null
          description?: string | null
          display_order?: number | null
          external_url?: string | null
          featured?: boolean | null
          id?: string
          problem?: string | null
          solution?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          year?: string | null
        }
        Update: {
          approach?: string[] | null
          category?: string | null
          client?: string | null
          created_at?: string | null
          demo_url?: string | null
          description?: string | null
          display_order?: number | null
          external_url?: string | null
          featured?: boolean | null
          id?: string
          problem?: string | null
          solution?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          year?: string | null
        }
        Relationships: []
      }
      premed_courses: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          credits: number | null
          id: string
          meeting_times: Json | null
          name: string
          semester_id: string | null
          type_tag: string | null
          user_id: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          id?: string
          meeting_times?: Json | null
          name: string
          semester_id?: string | null
          type_tag?: string | null
          user_id: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          id?: string
          meeting_times?: Json | null
          name?: string
          semester_id?: string | null
          type_tag?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "premed_courses_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          dedupe_key: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          dedupe_key: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          dedupe_key?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          assignments_enabled: boolean
          assignments_lead_hours: number
          created_at: string
          daily_digest_enabled: boolean
          daily_digest_time: string
          enabled: boolean
          exams_enabled: boolean
          exams_lead_days: number[]
          pushover_app_token: string | null
          pushover_device: string | null
          pushover_user_key: string | null
          quizzes_enabled: boolean
          quizzes_lead_days: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          assignments_enabled?: boolean
          assignments_lead_hours?: number
          created_at?: string
          daily_digest_enabled?: boolean
          daily_digest_time?: string
          enabled?: boolean
          exams_enabled?: boolean
          exams_lead_days?: number[]
          pushover_app_token?: string | null
          pushover_device?: string | null
          pushover_user_key?: string | null
          quizzes_enabled?: boolean
          quizzes_lead_days?: number[]
          updated_at?: string
          user_id: string
        }
        Update: {
          assignments_enabled?: boolean
          assignments_lead_hours?: number
          created_at?: string
          daily_digest_enabled?: boolean
          daily_digest_time?: string
          enabled?: boolean
          exams_enabled?: boolean
          exams_lead_days?: number[]
          pushover_app_token?: string | null
          pushover_device?: string | null
          pushover_user_key?: string | null
          quizzes_enabled?: boolean
          quizzes_lead_days?: number[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          color_theme: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          semester_start: string | null
          theme_preference: string | null
          timezone: string | null
        }
        Insert: {
          color_theme?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          semester_start?: string | null
          theme_preference?: string | null
          timezone?: string | null
        }
        Update: {
          color_theme?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          semester_start?: string | null
          theme_preference?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      quizzes: {
        Row: {
          course_id: string
          created_at: string
          id: string
          quiz_at: string
          title: string
          topics: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          quiz_at: string
          title: string
          topics?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          quiz_at?: string
          title?: string
          topics?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      readings: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          exam_id: string | null
          flashcard_deck_id: string | null
          id: string
          pages: string | null
          plan_order: number | null
          planned_date: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          exam_id?: string | null
          flashcard_deck_id?: string | null
          id?: string
          pages?: string | null
          plan_order?: number | null
          planned_date?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          exam_id?: string | null
          flashcard_deck_id?: string | null
          id?: string
          pages?: string | null
          plan_order?: number | null
          planned_date?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "readings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          color: string | null
          course_id: string | null
          created_at: string | null
          day: string
          end_time: string
          id: string
          label: string
          semester_id: string | null
          source: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          color?: string | null
          course_id?: string | null
          created_at?: string | null
          day: string
          end_time: string
          id?: string
          label: string
          semester_id?: string | null
          source?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          color?: string | null
          course_id?: string | null
          created_at?: string | null
          day?: string
          end_time?: string
          id?: string
          label?: string
          semester_id?: string | null
          source?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "premed_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          name: string
          notes: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          name: string
          notes?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      shadowing_wishlist: {
        Row: {
          created_at: string
          doctor_name: string | null
          id: string
          location: string | null
          notes: string | null
          priority: string | null
          specialty: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          priority?: string | null
          specialty: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          priority?: string | null
          specialty?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_items: {
        Row: {
          completed_at: string | null
          course_id: string | null
          created_at: string
          exam_id: string | null
          id: string
          notes: string | null
          plan_order: number | null
          planned_date: string | null
          priority: string
          quiz_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          notes?: string | null
          plan_order?: number | null
          planned_date?: string | null
          priority?: string
          quiz_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          notes?: string | null
          plan_order?: number | null
          planned_date?: string | null
          priority?: string
          quiz_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_items_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_items_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          exam_id: string | null
          id: string
          plan_order: number | null
          priority: string | null
          status: string | null
          title: string
          type: string
          user_id: string
          work_date: string | null
        }
        Insert: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          exam_id?: string | null
          id?: string
          plan_order?: number | null
          priority?: string | null
          status?: string | null
          title: string
          type: string
          user_id: string
          work_date?: string | null
        }
        Update: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          exam_id?: string | null
          id?: string
          plan_order?: number | null
          priority?: string | null
          status?: string | null
          title?: string
          type?: string
          user_id?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      widget_api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          label: string | null
          last_used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          label?: string | null
          last_used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          label?: string | null
          last_used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
