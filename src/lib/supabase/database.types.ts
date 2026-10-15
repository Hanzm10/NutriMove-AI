// Generated from the hosted Supabase project (satiqygzrdhzwkwqunoj). Regenerate with `pnpm db:types`
// after every migration — do not edit by hand.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_events: {
        Row: {
          created_at: string
          id: string
          input: Json
          kind: string
          output: Json
          rule_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input?: Json
          kind: string
          output?: Json
          rule_ids?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: Json
          kind?: string
          output?: Json
          rule_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          result: Json
          adherence: number | null
          check_date: string
          created_at: string
          energy: number | null
          hunger: number | null
          id: string
          new_pain: boolean
          notes: string | null
          user_id: string
          weight_kg: number | null
          workout_difficulty: string | null
        }
        Insert: {
          result?: Json
          adherence?: number | null
          check_date?: string
          created_at?: string
          energy?: number | null
          hunger?: number | null
          id?: string
          new_pain?: boolean
          notes?: string | null
          user_id: string
          weight_kg?: number | null
          workout_difficulty?: string | null
        }
        Update: {
          result?: Json
          adherence?: number | null
          check_date?: string
          created_at?: string
          energy?: number | null
          hunger?: number | null
          id?: string
          new_pain?: boolean
          notes?: string | null
          user_id?: string
          weight_kg?: number | null
          workout_difficulty?: string | null
        }
        Relationships: []
      }
      consents: {
        Row: {
          accepted_at: string
          id: string
          type: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          type: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          type?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          contraindications: string[]
          cues: string[]
          difficulty: number
          equipment: string[]
          id: string
          impact: string
          muscle_groups: string[]
          name: string
          pose_supported: boolean
          progression_slug: string | null
          regression_slug: string | null
          slug: string
          steps: string[]
        }
        Insert: {
          contraindications?: string[]
          cues?: string[]
          difficulty: number
          equipment?: string[]
          id?: string
          impact?: string
          muscle_groups?: string[]
          name: string
          pose_supported?: boolean
          progression_slug?: string | null
          regression_slug?: string | null
          slug: string
          steps?: string[]
        }
        Update: {
          contraindications?: string[]
          cues?: string[]
          difficulty?: number
          equipment?: string[]
          id?: string
          impact?: string
          muscle_groups?: string[]
          name?: string
          pose_supported?: boolean
          progression_slug?: string | null
          regression_slug?: string | null
          slug?: string
          steps?: string[]
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          food_id: string | null
          from_plan_item_id: string | null
          id: string
          kcal: number
          log_date: string
          meal_slot: string
          name: string
          protein_g: number
          quantity_g: number
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          from_plan_item_id?: string | null
          id?: string
          kcal: number
          log_date?: string
          meal_slot: string
          name: string
          protein_g?: number
          quantity_g: number
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          from_plan_item_id?: string | null
          id?: string
          kcal?: number
          log_date?: string
          meal_slot?: string
          name?: string
          protein_g?: number
          quantity_g?: number
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          brand: string | null
          carbs_100g: number
          created_at: string
          external_id: string | null
          fat_100g: number
          fiber_100g: number
          id: string
          kcal_100g: number
          name: string
          name_local: string | null
          protein_100g: number
          serving_g: number | null
          serving_label: string | null
          source: string
          source_ref: string | null
          user_id: string | null
        }
        Insert: {
          brand?: string | null
          carbs_100g?: number
          created_at?: string
          external_id?: string | null
          fat_100g?: number
          fiber_100g?: number
          id?: string
          kcal_100g: number
          name: string
          name_local?: string | null
          protein_100g?: number
          serving_g?: number | null
          serving_label?: string | null
          source: string
          source_ref?: string | null
          user_id?: string | null
        }
        Update: {
          brand?: string | null
          carbs_100g?: number
          created_at?: string
          external_id?: string | null
          fat_100g?: number
          fiber_100g?: number
          id?: string
          kcal_100g?: number
          name?: string
          name_local?: string | null
          protein_100g?: number
          serving_g?: number | null
          serving_label?: string | null
          source?: string
          source_ref?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meal_plan_items: {
        Row: {
          day: string
          id: string
          meal_plan_id: string
          meal_slot: string
          recipe_id: string
          score: number | null
          servings: number
          user_id: string
        }
        Insert: {
          day: string
          id?: string
          meal_plan_id: string
          meal_slot: string
          recipe_id: string
          score?: number | null
          servings?: number
          user_id: string
        }
        Update: {
          day?: string
          id?: string
          meal_plan_id?: string
          meal_slot?: string
          recipe_id?: string
          score?: number | null
          servings?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          explanation: Json
          id: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          explanation?: Json
          id?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          explanation?: Json
          id?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adapt_state: Json
          activity_level: string | null
          birthdate: string | null
          created_at: string
          days_per_week: number | null
          diet_prefs: Json
          display_name: string | null
          equipment: string[]
          experience_level: string | null
          goal: string | null
          height_cm: number | null
          minutes_per_session: number | null
          onboarding_completed_at: string | null
          onboarding_step: number
          sex: string | null
          target_weight_kg: number | null
          units: string
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          adapt_state?: Json
          activity_level?: string | null
          birthdate?: string | null
          created_at?: string
          days_per_week?: number | null
          diet_prefs?: Json
          display_name?: string | null
          equipment?: string[]
          experience_level?: string | null
          goal?: string | null
          height_cm?: number | null
          minutes_per_session?: number | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          sex?: string | null
          target_weight_kg?: number | null
          units?: string
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          adapt_state?: Json
          activity_level?: string | null
          birthdate?: string | null
          created_at?: string
          days_per_week?: number | null
          diet_prefs?: Json
          display_name?: string | null
          equipment?: string[]
          experience_level?: string | null
          goal?: string | null
          height_cm?: number | null
          minutes_per_session?: number | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          sex?: string | null
          target_weight_kg?: number | null
          units?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      recipe_ratings: {
        Row: {
          created_at: string
          rating: number
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          rating: number
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          rating?: number
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          allergens: string[]
          carbs_g: number
          cost_level: string
          diet_pattern: string
          fat_g: number
          fiber_g: number
          id: string
          image_url: string | null
          ingredients: Json
          instructions: string | null
          is_filipino: boolean
          kcal: number
          meal_slots: string[]
          name: string
          prep_minutes: number | null
          protein_g: number
          serving_g: number
          slug: string
          source_ref: string | null
          tags: string[]
        }
        Insert: {
          allergens?: string[]
          carbs_g: number
          cost_level?: string
          diet_pattern?: string
          fat_g: number
          fiber_g?: number
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: string | null
          is_filipino?: boolean
          kcal: number
          meal_slots: string[]
          name: string
          prep_minutes?: number | null
          protein_g: number
          serving_g: number
          slug: string
          source_ref?: string | null
          tags?: string[]
        }
        Update: {
          allergens?: string[]
          carbs_g?: number
          cost_level?: string
          diet_pattern?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: string | null
          is_filipino?: boolean
          kcal?: number
          meal_slots?: string[]
          name?: string
          prep_minutes?: number | null
          protein_g?: number
          serving_g?: number
          slug?: string
          source_ref?: string | null
          tags?: string[]
        }
        Relationships: []
      }
      screenings: {
        Row: {
          age_ok: boolean
          clearance_ack: boolean
          created_at: string
          flagged: boolean
          id: string
          parq: Json
          pregnant_or_bf: boolean
          user_id: string
        }
        Insert: {
          age_ok: boolean
          clearance_ack?: boolean
          created_at?: string
          flagged?: boolean
          id?: string
          parq?: Json
          pregnant_or_bf?: boolean
          user_id: string
        }
        Update: {
          age_ok?: boolean
          clearance_ack?: boolean
          created_at?: string
          flagged?: boolean
          id?: string
          parq?: Json
          pregnant_or_bf?: boolean
          user_id?: string
        }
        Relationships: []
      }
      session_sets: {
        Row: {
          duration_s: number | null
          error_counts: Json
          id: string
          reps_counted: number
          reps_good: number
          session_id: string
          set_idx: number
          user_id: string
        }
        Insert: {
          duration_s?: number | null
          error_counts?: Json
          id?: string
          reps_counted?: number
          reps_good?: number
          session_id: string
          set_idx: number
          user_id: string
        }
        Update: {
          duration_s?: number | null
          error_counts?: Json
          id?: string
          reps_counted?: number
          reps_good?: number
          session_id?: string
          set_idx?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          kind: string
          respondent_role: string
          user_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          kind: string
          respondent_role: string
          user_id?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          kind?: string
          respondent_role?: string
          user_id?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          bmr: number
          carbs_g: number
          created_at: string
          effective_from: string
          explanation: Json
          fat_g: number
          fiber_g: number
          id: string
          kcal: number
          protein_g: number
          tdee: number
          user_id: string
        }
        Insert: {
          bmr: number
          carbs_g: number
          created_at?: string
          effective_from?: string
          explanation?: Json
          fat_g: number
          fiber_g?: number
          id?: string
          kcal: number
          protein_g: number
          tdee: number
          user_id: string
        }
        Update: {
          bmr?: number
          carbs_g?: number
          created_at?: string
          effective_from?: string
          explanation?: Json
          fat_g?: number
          fiber_g?: number
          id?: string
          kcal?: number
          protein_g?: number
          tdee?: number
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          high_contrast: boolean
          larger_text: boolean
          reduce_motion: boolean
          tts_cues: boolean
          updated_at: string
          user_id: string
          water_goal: number
        }
        Insert: {
          high_contrast?: boolean
          larger_text?: boolean
          reduce_motion?: boolean
          tts_cues?: boolean
          updated_at?: string
          user_id: string
          water_goal?: number
        }
        Update: {
          high_contrast?: boolean
          larger_text?: boolean
          reduce_motion?: boolean
          tts_cues?: boolean
          updated_at?: string
          user_id?: string
          water_goal?: number
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          glasses: number
          id: string
          log_date: string
          user_id: string
        }
        Insert: {
          glasses?: number
          id?: string
          log_date?: string
          user_id: string
        }
        Update: {
          glasses?: number
          id?: string
          log_date?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          id: string
          log_date: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          id?: string
          log_date?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          id?: string
          log_date?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workout_plan_items: {
        Row: {
          day: string
          exercise_id: string
          id: string
          order_idx: number
          reps: number
          rest_s: number
          sets: number
          user_id: string
          workout_plan_id: string
        }
        Insert: {
          day: string
          exercise_id: string
          id?: string
          order_idx: number
          reps: number
          rest_s?: number
          sets: number
          user_id: string
          workout_plan_id: string
        }
        Update: {
          day?: string
          exercise_id?: string
          id?: string
          order_idx?: number
          reps?: number
          rest_s?: number
          sets?: number
          user_id?: string
          workout_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plan_items_workout_plan_id_fkey"
            columns: ["workout_plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          created_at: string
          explanation: Json
          id: string
          split: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          explanation?: Json
          id?: string
          split: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          explanation?: Json
          id?: string
          split?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          avg_fps: number | null
          device_class: string | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          created_at: string
          ended_at: string | null
          exercise_id: string
          id: string
          plan_item_id: string | null
          pose_backend: string | null
          rating: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          avg_fps?: number | null
          device_class?: string | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          created_at?: string
          ended_at?: string | null
          exercise_id: string
          id?: string
          plan_item_id?: string | null
          pose_backend?: string | null
          rating?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          avg_fps?: number | null
          device_class?: string | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          created_at?: string
          ended_at?: string | null
          exercise_id?: string
          id?: string
          plan_item_id?: string | null
          pose_backend?: string | null
          rating?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_my_account: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
