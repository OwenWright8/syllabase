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
      course_document_chunks: {
        Row: {
          data: string
          document_id: string
          seq: number
          user_id: string
        }
        Insert: {
          data: string
          document_id: string
          seq: number
          user_id: string
        }
        Update: {
          data?: string
          document_id?: string
          seq?: number
          user_id?: string
        }
        Relationships: []
      }
      course_documents: {
        Row: {
          course_id: string
          created_at: string
          error: string | null
          filename: string
          id: string
          kind: string
          mime_type: string | null
          page_count: number | null
          page_offset: number
          progress: number
          size_bytes: number
          status: string
          updated_at: string
          uploaded_bytes: number
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          error?: string | null
          filename: string
          id?: string
          kind: string
          mime_type?: string | null
          page_count?: number | null
          page_offset?: number
          progress?: number
          size_bytes: number
          status?: string
          updated_at?: string
          uploaded_bytes?: number
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          error?: string | null
          filename?: string
          id?: string
          kind?: string
          mime_type?: string | null
          page_count?: number | null
          page_offset?: number
          progress?: number
          size_bytes?: number
          status?: string
          updated_at?: string
          uploaded_bytes?: number
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          class_time: string | null
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
          class_time?: string | null
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
          class_time?: string | null
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
      document_chapters: {
        Row: {
          created_at: string
          document_id: string
          end_page: number
          id: string
          number: number | null
          source: string
          start_page: number
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          end_page: number
          id?: string
          number?: number | null
          source?: string
          start_page: number
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          end_page?: number
          id?: string
          number?: number | null
          source?: string
          start_page?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      document_extracts: {
        Row: {
          created_at: string
          data: string | null
          document_id: string
          end_page: number
          error: string | null
          id: string
          size_bytes: number | null
          start_page: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: string | null
          document_id: string
          end_page: number
          error?: string | null
          id?: string
          size_bytes?: number | null
          start_page: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: string | null
          document_id?: string
          end_page?: number
          error?: string | null
          id?: string
          size_bytes?: number | null
          start_page?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      document_limits: {
        Row: {
          enabled: boolean
          max_file_bytes: number
          max_pages: number
          max_user_bytes: number
          singleton: boolean
        }
        Insert: {
          enabled?: boolean
          max_file_bytes?: number
          max_pages?: number
          max_user_bytes?: number
          singleton?: boolean
        }
        Update: {
          enabled?: boolean
          max_file_bytes?: number
          max_pages?: number
          max_user_bytes?: number
          singleton?: boolean
        }
        Relationships: []
      }
      document_pages: {
        Row: {
          document_id: string
          ocr: boolean
          page: number
          text: string
          user_id: string
        }
        Insert: {
          document_id: string
          ocr?: boolean
          page: number
          text?: string
          user_id: string
        }
        Update: {
          document_id?: string
          ocr?: boolean
          page?: number
          text?: string
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
      extract_piece: {
        Args: { p_extract: string; p_piece: number }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
