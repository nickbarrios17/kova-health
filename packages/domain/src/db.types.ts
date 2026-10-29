export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      body_measurements: {
        Row: {
          created_at: string
          deleted_at: string | null
          device_id: string | null
          external_id: string | null
          id: string
          is_estimated: boolean
          local_date: string
          measured_at: string
          metric: Database["public"]["Enums"]["body_metric"]
          note: string | null
          source: Database["public"]["Enums"]["data_origin"]
          source_app: string | null
          time_zone: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          local_date: string
          measured_at: string
          metric: Database["public"]["Enums"]["body_metric"]
          note?: string | null
          source?: Database["public"]["Enums"]["data_origin"]
          source_app?: string | null
          time_zone: string
          updated_at?: string
          user_id?: string
          value: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          local_date?: string
          measured_at?: string
          metric?: Database["public"]["Enums"]["body_metric"]
          note?: string | null
          source?: Database["public"]["Enums"]["data_origin"]
          source_app?: string | null
          time_zone?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["device_kind"]
          label: string | null
          last_seen_at: string | null
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["device_kind"]
          label?: string | null
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["device_kind"]
          label?: string | null
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          code: string
          created_at: string
          description: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
        }
        Relationships: []
      }
      equipment_types: {
        Row: {
          code: string
          name_es: string
        }
        Insert: {
          code: string
          name_es: string
        }
        Update: {
          code?: string
          name_es?: string
        }
        Relationships: []
      }
      exercise_equipment: {
        Row: {
          equipment_code: string
          exercise_id: string
        }
        Insert: {
          equipment_code: string
          exercise_id: string
        }
        Update: {
          equipment_code?: string
          exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_equipment_equipment_code_fkey"
            columns: ["equipment_code"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exercise_equipment_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_muscles: {
        Row: {
          exercise_id: string
          muscle_code: string
          role: Database["public"]["Enums"]["muscle_role"]
        }
        Insert: {
          exercise_id: string
          muscle_code: string
          role?: Database["public"]["Enums"]["muscle_role"]
        }
        Update: {
          exercise_id?: string
          muscle_code?: string
          role?: Database["public"]["Enums"]["muscle_role"]
        }
        Relationships: [
          {
            foreignKeyName: "exercise_muscles_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_muscles_muscle_code_fkey"
            columns: ["muscle_code"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["code"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at: string
          description: string | null
          id: string
          instructions: Json
          level: Database["public"]["Enums"]["exercise_level"] | null
          measurement_type: Database["public"]["Enums"]["measurement_type"]
          media: Json
          name: string
          owner_id: string | null
          short_name: string | null
          slug: string
          updated_at: string
          variation_of: string | null
        }
        Insert: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          description?: string | null
          id?: string
          instructions?: Json
          level?: Database["public"]["Enums"]["exercise_level"] | null
          measurement_type?: Database["public"]["Enums"]["measurement_type"]
          media?: Json
          name: string
          owner_id?: string | null
          short_name?: string | null
          slug: string
          updated_at?: string
          variation_of?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          description?: string | null
          id?: string
          instructions?: Json
          level?: Database["public"]["Enums"]["exercise_level"] | null
          measurement_type?: Database["public"]["Enums"]["measurement_type"]
          media?: Json
          name?: string
          owner_id?: string | null
          short_name?: string | null
          slug?: string
          updated_at?: string
          variation_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_variation_of_fkey"
            columns: ["variation_of"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          archived_at: string | null
          barcode: string | null
          brand: string | null
          carbs_g: number
          created_at: string
          data_source: Database["public"]["Enums"]["nutrition_source"]
          default_quantity: number | null
          fat_g: number
          fiber_g: number | null
          id: string
          kcal: number
          name: string
          owner_id: string | null
          protein_g: number
          ref_amount: number
          ref_unit: Database["public"]["Enums"]["food_unit"]
          serving_label: string | null
          source_ref: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          barcode?: string | null
          brand?: string | null
          carbs_g: number
          created_at?: string
          data_source?: Database["public"]["Enums"]["nutrition_source"]
          default_quantity?: number | null
          fat_g: number
          fiber_g?: number | null
          id?: string
          kcal: number
          name: string
          owner_id?: string | null
          protein_g: number
          ref_amount: number
          ref_unit: Database["public"]["Enums"]["food_unit"]
          serving_label?: string | null
          source_ref?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          barcode?: string | null
          brand?: string | null
          carbs_g?: number
          created_at?: string
          data_source?: Database["public"]["Enums"]["nutrition_source"]
          default_quantity?: number | null
          fat_g?: number
          fiber_g?: number | null
          id?: string
          kcal?: number
          name?: string
          owner_id?: string | null
          protein_g?: number
          ref_amount?: number
          ref_unit?: Database["public"]["Enums"]["food_unit"]
          serving_label?: string | null
          source_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          achieved_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["goal_kind"]
          notes: string | null
          start_date: string
          start_value: number | null
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string | null
          target_value: number
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["goal_kind"]
          notes?: string | null
          start_date: string
          start_value?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          target_value: number
          title: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["goal_kind"]
          notes?: string | null
          start_date?: string
          start_value?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          target_value?: number
          title?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          created_at: string
          deleted_at: string | null
          device_id: string | null
          habit_id: string
          id: string
          local_date: string
          logged_at: string
          note: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          habit_id: string
          id?: string
          local_date: string
          logged_at?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          habit_id?: string
          id?: string
          local_date?: string
          logged_at?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "habit_logs_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habit_schedules: {
        Row: {
          created_at: string
          days: number[]
          effective_from: string
          frequency: Database["public"]["Enums"]["habit_frequency"]
          habit_id: string
          id: string
          target_value: number | null
          times_per_week: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number[]
          effective_from: string
          frequency?: Database["public"]["Enums"]["habit_frequency"]
          habit_id: string
          id?: string
          target_value?: number | null
          times_per_week?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          days?: number[]
          effective_from?: string
          frequency?: Database["public"]["Enums"]["habit_frequency"]
          habit_id?: string
          id?: string
          target_value?: number | null
          times_per_week?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_schedules_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habits: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          kind: Database["public"]["Enums"]["habit_kind"]
          name: string
          position: number
          start_date: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["habit_kind"]
          name: string
          position?: number
          start_date: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["habit_kind"]
          name?: string
          position?: number
          start_date?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_observations: {
        Row: {
          created_at: string
          deleted_at: string | null
          details: Json
          device_id: string | null
          end_at: string | null
          external_id: string | null
          id: string
          is_estimated: boolean
          local_date: string
          metric: Database["public"]["Enums"]["health_metric"]
          source: Database["public"]["Enums"]["data_origin"]
          source_app: string | null
          start_at: string
          time_zone: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          details?: Json
          device_id?: string | null
          end_at?: string | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          local_date: string
          metric: Database["public"]["Enums"]["health_metric"]
          source?: Database["public"]["Enums"]["data_origin"]
          source_app?: string | null
          start_at: string
          time_zone: string
          updated_at?: string
          user_id?: string
          value: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          details?: Json
          device_id?: string | null
          end_at?: string | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          local_date?: string
          metric?: Database["public"]["Enums"]["health_metric"]
          source?: Database["public"]["Enums"]["data_origin"]
          source_app?: string | null
          start_at?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_observations_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      meal_items: {
        Row: {
          carbs_g: number
          created_at: string
          data_source: Database["public"]["Enums"]["nutrition_source"]
          deleted_at: string | null
          device_id: string | null
          fat_g: number
          fiber_g: number | null
          food_id: string | null
          id: string
          kcal: number
          logged_at: string
          meal_id: string
          name: string
          protein_g: number
          quantity: number
          recipe_id: string | null
          unit: Database["public"]["Enums"]["food_unit"]
          updated_at: string
          user_id: string
        }
        Insert: {
          carbs_g: number
          created_at?: string
          data_source: Database["public"]["Enums"]["nutrition_source"]
          deleted_at?: string | null
          device_id?: string | null
          fat_g: number
          fiber_g?: number | null
          food_id?: string | null
          id?: string
          kcal: number
          logged_at?: string
          meal_id: string
          name: string
          protein_g: number
          quantity: number
          recipe_id?: string | null
          unit: Database["public"]["Enums"]["food_unit"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          carbs_g?: number
          created_at?: string
          data_source?: Database["public"]["Enums"]["nutrition_source"]
          deleted_at?: string | null
          device_id?: string | null
          fat_g?: number
          fiber_g?: number | null
          food_id?: string | null
          id?: string
          kcal?: number
          logged_at?: string
          meal_id?: string
          name?: string
          protein_g?: number
          quantity?: number
          recipe_id?: string | null
          unit?: Database["public"]["Enums"]["food_unit"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_user_id_fkey"
            columns: ["meal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "meal_items_recipe_id_user_id_fkey"
            columns: ["recipe_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recipe_nutrition"
            referencedColumns: ["recipe_id", "user_id"]
          },
          {
            foreignKeyName: "meal_items_recipe_id_user_id_fkey"
            columns: ["recipe_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      meals: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          local_date: string
          notes: string | null
          slot: Database["public"]["Enums"]["meal_slot"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_date: string
          notes?: string | null
          slot: Database["public"]["Enums"]["meal_slot"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_date?: string
          notes?: string | null
          slot?: Database["public"]["Enums"]["meal_slot"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      muscle_groups: {
        Row: {
          body_part: string
          code: string
          name_es: string
        }
        Insert: {
          body_part: string
          code: string
          name_es: string
        }
        Update: {
          body_part?: string
          code?: string
          name_es?: string
        }
        Relationships: []
      }
      nutrition_goals: {
        Row: {
          carbs_g: number | null
          created_at: string
          effective_from: string
          fat_g: number | null
          id: string
          is_estimated: boolean
          kcal: number | null
          protein_g: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carbs_g?: number | null
          created_at?: string
          effective_from: string
          fat_g?: number | null
          id?: string
          is_estimated?: boolean
          kcal?: number | null
          protein_g?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          carbs_g?: number | null
          created_at?: string
          effective_from?: string
          fat_g?: number | null
          id?: string
          is_estimated?: boolean
          kcal?: number | null
          protein_g?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: Database["public"]["Enums"]["activity_level"] | null
          birth_year: number | null
          created_at: string
          display_name: string | null
          goal_pace: Database["public"]["Enums"]["goal_pace"] | null
          height_cm: number | null
          id: string
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          sex: Database["public"]["Enums"]["biological_sex"] | null
          updated_at: string
          weight_goal: Database["public"]["Enums"]["weight_goal"] | null
        }
        Insert: {
          activity_level?: Database["public"]["Enums"]["activity_level"] | null
          birth_year?: number | null
          created_at?: string
          display_name?: string | null
          goal_pace?: Database["public"]["Enums"]["goal_pace"] | null
          height_cm?: number | null
          id: string
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          sex?: Database["public"]["Enums"]["biological_sex"] | null
          updated_at?: string
          weight_goal?: Database["public"]["Enums"]["weight_goal"] | null
        }
        Update: {
          activity_level?: Database["public"]["Enums"]["activity_level"] | null
          birth_year?: number | null
          created_at?: string
          display_name?: string | null
          goal_pace?: Database["public"]["Enums"]["goal_pace"] | null
          height_cm?: number | null
          id?: string
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          sex?: Database["public"]["Enums"]["biological_sex"] | null
          updated_at?: string
          weight_goal?: Database["public"]["Enums"]["weight_goal"] | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          food_id: string
          id: string
          position: number
          quantity: number
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          position: number
          quantity: number
          recipe_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          position?: number
          quantity?: number
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_user_id_fkey"
            columns: ["recipe_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recipe_nutrition"
            referencedColumns: ["recipe_id", "user_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_user_id_fkey"
            columns: ["recipe_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      recipes: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          servings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      routine_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          position: number
          routine_id: string
          target_duration_s: number | null
          target_load_kg: number | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rest_s: number | null
          target_sets: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          position: number
          routine_id: string
          target_duration_s?: number | null
          target_load_kg?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rest_s?: number | null
          target_sets: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          routine_id?: string
          target_duration_s?: number | null
          target_load_kg?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rest_s?: number | null
          target_sets?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_routine_id_user_id_fkey"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      routines: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          schedule_days: number[]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          schedule_days?: number[]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          schedule_days?: number[]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      shown_insights: {
        Row: {
          created_at: string
          dismissed_at: string | null
          feedback: string | null
          id: string
          insight_key: string
          kind: string
          shown_at: string
          shown_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          feedback?: string | null
          id?: string
          insight_key: string
          kind: string
          shown_at?: string
          shown_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          feedback?: string | null
          id?: string
          insight_key?: string
          kind?: string
          shown_at?: string
          shown_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          created_at: string
          entitlement: string
          id: string
          provider_ref: string | null
          source: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          entitlement: string
          id?: string
          provider_ref?: string | null
          source: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          entitlement?: string
          id?: string
          provider_ref?: string | null
          source?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlements_entitlement_fkey"
            columns: ["entitlement"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["code"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          locale: string
          time_zone: string
          updated_at: string
          user_id: string
          week_start: number
          weight_unit: Database["public"]["Enums"]["weight_unit"]
        }
        Insert: {
          created_at?: string
          locale?: string
          time_zone?: string
          updated_at?: string
          user_id: string
          week_start?: number
          weight_unit?: Database["public"]["Enums"]["weight_unit"]
        }
        Update: {
          created_at?: string
          locale?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
          week_start?: number
          weight_unit?: Database["public"]["Enums"]["weight_unit"]
        }
        Relationships: []
      }
      workout_session_exercises: {
        Row: {
          created_at: string
          deleted_at: string | null
          exercise_id: string
          id: string
          notes: string | null
          planned_duration_s: number | null
          planned_load_kg: number | null
          planned_reps_max: number | null
          planned_reps_min: number | null
          planned_rest_s: number | null
          planned_sets: number | null
          position: number
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          exercise_id: string
          id?: string
          notes?: string | null
          planned_duration_s?: number | null
          planned_load_kg?: number | null
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_rest_s?: number | null
          planned_sets?: number | null
          position: number
          session_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          exercise_id?: string
          id?: string
          notes?: string | null
          planned_duration_s?: number | null
          planned_load_kg?: number | null
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_rest_s?: number | null
          planned_sets?: number | null
          position?: number
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "session_summaries"
            referencedColumns: ["session_id", "user_id"]
          },
          {
            foreignKeyName: "workout_session_exercises_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          avg_hr: number | null
          created_at: string
          deleted_at: string | null
          device_id: string | null
          ended_at: string | null
          energy_is_estimated: boolean
          energy_kcal: number | null
          id: string
          local_date: string
          name: string
          notes: string | null
          paused_at: string | null
          routine_id: string | null
          routine_version: number | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          tags: string[]
          time_zone: string
          total_paused_s: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          ended_at?: string | null
          energy_is_estimated?: boolean
          energy_kcal?: number | null
          id?: string
          local_date: string
          name: string
          notes?: string | null
          paused_at?: string | null
          routine_id?: string | null
          routine_version?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          tags?: string[]
          time_zone: string
          total_paused_s?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          avg_hr?: number | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          ended_at?: string | null
          energy_is_estimated?: boolean
          energy_kcal?: number | null
          id?: string
          local_date?: string
          name?: string
          notes?: string | null
          paused_at?: string | null
          routine_id?: string | null
          routine_version?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          tags?: string[]
          time_zone?: string
          total_paused_s?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "workout_sessions_routine_id_user_id_fkey"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          client_recorded_at: string | null
          completed_at: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          distance_m: number | null
          duration_s: number | null
          id: string
          reps: number | null
          rest_s: number | null
          rpe: number | null
          session_exercise_id: string
          session_id: string
          set_index: number
          set_type: Database["public"]["Enums"]["set_type"]
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          client_recorded_at?: string | null
          completed_at?: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          id?: string
          reps?: number | null
          rest_s?: number | null
          rpe?: number | null
          session_exercise_id: string
          session_id: string
          set_index: number
          set_type?: Database["public"]["Enums"]["set_type"]
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Update: {
          client_recorded_at?: string | null
          completed_at?: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          id?: string
          reps?: number | null
          rest_s?: number | null
          rpe?: number | null
          session_exercise_id?: string
          session_id?: string
          set_index?: number
          set_type?: Database["public"]["Enums"]["set_type"]
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "workout_sets_session_exercise_id_session_id_fkey"
            columns: ["session_exercise_id", "session_id"]
            isOneToOne: false
            referencedRelation: "workout_session_exercises"
            referencedColumns: ["id", "session_id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "session_summaries"
            referencedColumns: ["session_id", "user_id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      exercise_history: {
        Row: {
          completed_at: string | null
          distance_m: number | null
          duration_s: number | null
          e1rm_kg: number | null
          exercise_id: string | null
          local_date: string | null
          reps: number | null
          rpe: number | null
          session_id: string | null
          set_id: string | null
          set_index: number | null
          set_type: Database["public"]["Enums"]["set_type"] | null
          user_id: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "session_summaries"
            referencedColumns: ["session_id", "user_id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      frequent_foods: {
        Row: {
          food_id: string | null
          last_logged_at: string | null
          times_logged: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_daily: {
        Row: {
          carbs_g: number | null
          fat_g: number | null
          has_unverified_values: boolean | null
          items: number | null
          kcal: number | null
          local_date: string | null
          protein_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
      personal_records: {
        Row: {
          best_e1rm_kg: number | null
          best_set_volume_kg: number | null
          exercise_id: string | null
          last_performed_at: string | null
          max_reps: number | null
          max_weight_kg: number | null
          total_sets: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_nutrition: {
        Row: {
          carbs_g_per_serving: number | null
          fat_g_per_serving: number | null
          has_unverified_values: boolean | null
          kcal_per_serving: number | null
          protein_g_per_serving: number | null
          recipe_id: string | null
          servings: number | null
          user_id: string | null
        }
        Relationships: []
      }
      session_summaries: {
        Row: {
          active_duration_s: number | null
          ended_at: string | null
          energy_is_estimated: boolean | null
          energy_kcal: number | null
          local_date: string | null
          name: string | null
          pr_count: number | null
          routine_id: string | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          user_id: string | null
          volume_kg: number | null
          working_sets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_routine_id_user_id_fkey"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Functions: {
      complete_onboarding: {
        Args: {
          p_activity_level: Database["public"]["Enums"]["activity_level"]
          p_birth_year: number
          p_carbs_g: number
          p_display_name: string
          p_fat_g: number
          p_goal_pace: Database["public"]["Enums"]["goal_pace"]
          p_height_cm: number
          p_is_estimated?: boolean
          p_kcal: number
          p_measurement_id: string
          p_protein_g: number
          p_sex: Database["public"]["Enums"]["biological_sex"]
          p_time_zone?: string
          p_weight_goal: Database["public"]["Enums"]["weight_goal"]
          p_weight_kg: number
        }
        Returns: {
          activity_level: Database["public"]["Enums"]["activity_level"] | null
          birth_year: number | null
          created_at: string
          display_name: string | null
          goal_pace: Database["public"]["Enums"]["goal_pace"] | null
          height_cm: number | null
          id: string
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          sex: Database["public"]["Enums"]["biological_sex"] | null
          updated_at: string
          weight_goal: Database["public"]["Enums"]["weight_goal"] | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      daily_summaries: {
        Args: { p_from: string; p_to: string }
        Returns: {
          calc_version: number
          carbs_g: number
          carbs_goal_g: number
          fat_g: number
          fat_goal_g: number
          habits_completed: number
          habits_scheduled: number
          hrv_rmssd_ms: number
          kcal: number
          kcal_goal: number
          local_date: string
          mood: number
          nutrition_has_unverified: boolean
          nutrition_items: number
          protein_g: number
          protein_goal_g: number
          resting_hr_bpm: number
          sleep_min: number
          steps: number
          weight_kg: number
          workout_active_s: number
          workout_volume_kg: number
          workouts_completed: number
        }[]
      }
      duplicate_routine: {
        Args: { p_name?: string; p_new_id: string; p_source_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          schedule_days: number[]
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "routines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      export_my_data: { Args: never; Returns: Json }
      habit_days: {
        Args: { p_from: string; p_to: string }
        Returns: {
          completed: boolean
          frequency: Database["public"]["Enums"]["habit_frequency"]
          habit_id: string
          local_date: string
          scheduled: boolean
          target_value: number
          times_per_week: number
          value: number
        }[]
      }
      has_entitlement: { Args: { p_code: string }; Returns: boolean }
      log_food: {
        Args: {
          p_carbs_g?: number
          p_device_id?: string
          p_fat_g?: number
          p_food_id?: string
          p_item_id: string
          p_kcal?: number
          p_local_date: string
          p_logged_at?: string
          p_name?: string
          p_protein_g?: number
          p_quantity: number
          p_recipe_id?: string
          p_slot: Database["public"]["Enums"]["meal_slot"]
        }
        Returns: {
          carbs_g: number
          created_at: string
          data_source: Database["public"]["Enums"]["nutrition_source"]
          deleted_at: string | null
          device_id: string | null
          fat_g: number
          fiber_g: number | null
          food_id: string | null
          id: string
          kcal: number
          logged_at: string
          meal_id: string
          name: string
          protein_g: number
          quantity: number
          recipe_id: string | null
          unit: Database["public"]["Enums"]["food_unit"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meal_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_body_measurements: { Args: { p_rows: Json }; Returns: number }
      record_observations: { Args: { p_rows: Json }; Returns: number }
      record_set: {
        Args: {
          p_completed_at?: string
          p_device_id?: string
          p_distance_m?: number
          p_duration_s?: number
          p_id: string
          p_reps?: number
          p_rest_s?: number
          p_rpe?: number
          p_session_exercise_id: string
          p_set_index: number
          p_set_type?: Database["public"]["Enums"]["set_type"]
          p_weight_kg?: number
        }
        Returns: {
          client_recorded_at: string | null
          completed_at: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          distance_m: number | null
          duration_s: number | null
          id: string
          reps: number | null
          rest_s: number | null
          rpe: number | null
          session_exercise_id: string
          session_id: string
          set_index: number
          set_type: Database["public"]["Enums"]["set_type"]
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "workout_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_habit: {
        Args: {
          p_days?: number[]
          p_effective_from: string
          p_frequency?: Database["public"]["Enums"]["habit_frequency"]
          p_icon?: string
          p_id: string
          p_kind?: Database["public"]["Enums"]["habit_kind"]
          p_name: string
          p_target_value?: number
          p_times_per_week?: number
          p_unit?: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          kind: Database["public"]["Enums"]["habit_kind"]
          name: string
          position: number
          start_date: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "habits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_routine: {
        Args: {
          p_expected_version?: number
          p_id: string
          p_items: Json
          p_name: string
          p_notes?: string
          p_schedule_days?: number[]
        }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          schedule_days: number[]
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "routines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_session: {
        Args: {
          p_device_id?: string
          p_exercises?: Json
          p_id: string
          p_name?: string
          p_routine_id?: string
          p_started_at?: string
          p_time_zone?: string
        }
        Returns: {
          avg_hr: number | null
          created_at: string
          deleted_at: string | null
          device_id: string | null
          ended_at: string | null
          energy_is_estimated: boolean
          energy_kcal: number | null
          id: string
          local_date: string
          name: string
          notes: string | null
          paused_at: string | null
          routine_id: string | null
          routine_version: number | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          tags: string[]
          time_zone: string
          total_paused_s: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_session: {
        Args: { p_action: string; p_at?: string; p_id: string }
        Returns: {
          avg_hr: number | null
          created_at: string
          deleted_at: string | null
          device_id: string | null
          ended_at: string | null
          energy_is_estimated: boolean
          energy_kcal: number | null
          id: string
          local_date: string
          name: string
          notes: string | null
          paused_at: string | null
          routine_id: string | null
          routine_version: number | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          tags: string[]
          time_zone: string
          total_paused_s: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      activity_level: "sedentary" | "light" | "moderate" | "very_active"
      biological_sex: "male" | "female"
      body_metric:
        | "weight_kg"
        | "body_fat_pct"
        | "muscle_mass_kg"
        | "lean_mass_kg"
        | "waist_cm"
        | "hip_cm"
        | "chest_cm"
        | "arm_cm"
        | "thigh_cm"
        | "neck_cm"
      data_origin:
        | "manual"
        | "health_connect"
        | "healthkit"
        | "wear_os"
        | "import"
      device_kind: "web" | "mobile" | "watch"
      exercise_category:
        | "strength"
        | "cardio"
        | "stretching"
        | "plyometrics"
        | "mobility"
      exercise_level: "beginner" | "intermediate" | "advanced"
      food_unit: "g" | "ml" | "serving"
      goal_kind:
        | "weight"
        | "steps_daily"
        | "sleep_minutes_daily"
        | "workouts_weekly"
        | "custom"
      goal_pace: "light" | "moderate" | "aggressive"
      goal_status: "active" | "achieved" | "abandoned"
      habit_frequency: "daily" | "weekly"
      habit_kind: "check" | "count" | "duration"
      health_metric:
        | "sleep_session"
        | "resting_hr_bpm"
        | "hrv_rmssd_ms"
        | "steps"
        | "distance_m"
        | "active_energy_kcal"
        | "active_minutes"
        | "mood"
        | "stress"
      meal_slot: "breakfast" | "lunch" | "afternoon_snack" | "dinner" | "snack"
      measurement_type:
        | "weight_reps"
        | "reps"
        | "duration"
        | "distance_duration"
      muscle_role: "primary" | "secondary"
      nutrition_source: "verified" | "label" | "user" | "estimated"
      onboarding_state: "new" | "profile" | "goals" | "done"
      session_status: "in_progress" | "paused" | "completed" | "abandoned"
      set_type: "warmup" | "working" | "drop" | "failure"
      weight_goal: "lose" | "maintain" | "gain" | "recomp"
      weight_unit: "kg" | "lb"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_level: ["sedentary", "light", "moderate", "very_active"],
      biological_sex: ["male", "female"],
      body_metric: [
        "weight_kg",
        "body_fat_pct",
        "muscle_mass_kg",
        "lean_mass_kg",
        "waist_cm",
        "hip_cm",
        "chest_cm",
        "arm_cm",
        "thigh_cm",
        "neck_cm",
      ],
      data_origin: [
        "manual",
        "health_connect",
        "healthkit",
        "wear_os",
        "import",
      ],
      device_kind: ["web", "mobile", "watch"],
      exercise_category: [
        "strength",
        "cardio",
        "stretching",
        "plyometrics",
        "mobility",
      ],
      exercise_level: ["beginner", "intermediate", "advanced"],
      food_unit: ["g", "ml", "serving"],
      goal_kind: [
        "weight",
        "steps_daily",
        "sleep_minutes_daily",
        "workouts_weekly",
        "custom",
      ],
      goal_pace: ["light", "moderate", "aggressive"],
      goal_status: ["active", "achieved", "abandoned"],
      habit_frequency: ["daily", "weekly"],
      habit_kind: ["check", "count", "duration"],
      health_metric: [
        "sleep_session",
        "resting_hr_bpm",
        "hrv_rmssd_ms",
        "steps",
        "distance_m",
        "active_energy_kcal",
        "active_minutes",
        "mood",
        "stress",
      ],
      meal_slot: ["breakfast", "lunch", "afternoon_snack", "dinner", "snack"],
      measurement_type: [
        "weight_reps",
        "reps",
        "duration",
        "distance_duration",
      ],
      muscle_role: ["primary", "secondary"],
      nutrition_source: ["verified", "label", "user", "estimated"],
      onboarding_state: ["new", "profile", "goals", "done"],
      session_status: ["in_progress", "paused", "completed", "abandoned"],
      set_type: ["warmup", "working", "drop", "failure"],
      weight_goal: ["lose", "maintain", "gain", "recomp"],
      weight_unit: ["kg", "lb"],
    },
  },
} as const

