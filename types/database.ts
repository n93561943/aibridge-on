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
      attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          post_id: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          post_id?: string | null
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          post_id?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          depth: number
          hidden_at: string | null
          id: string
          parent_id: string | null
          post_id: string
          score: number
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          depth?: number
          hidden_at?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
          score?: number
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          depth?: number
          hidden_at?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_consents: {
        Row: {
          consented_at: string | null
          created_at: string
          expires_at: string
          guardian_email: string
          id: string
          profile_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          consented_at?: string | null
          created_at?: string
          expires_at: string
          guardian_email: string
          id?: string
          profile_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          consented_at?: string | null
          created_at?: string
          expires_at?: string
          guardian_email?: string
          id?: string
          profile_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          board_allow_comments: boolean
          board_allow_votes: boolean
          board_write_role: string | null
          created_at: string
          external_url: string | null
          id: string
          is_active: boolean
          parent_id: string | null
          slug: string
          sort_order: number
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          board_allow_comments?: boolean
          board_allow_votes?: boolean
          board_write_role?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_active?: boolean
          parent_id?: string | null
          slug: string
          sort_order?: number
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          board_allow_comments?: boolean
          board_allow_votes?: boolean
          board_write_role?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_active?: boolean
          parent_id?: string | null
          slug?: string
          sort_order?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_attempts: {
        Row: {
          email_hash: string
          fail_count: number
          issued_at: string
          updated_at: string
        }
        Insert: {
          email_hash: string
          fail_count?: number
          issued_at?: string
          updated_at?: string
        }
        Update: {
          email_hash?: string
          fail_count?: number
          issued_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_revisions: {
        Row: {
          content: Json
          created_at: string
          editor_id: string | null
          id: string
          post_id: string
          title: string
        }
        Insert: {
          content: Json
          created_at?: string
          editor_id?: string | null
          id?: string
          post_id: string
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          editor_id?: string | null
          id?: string
          post_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_revisions_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_discussion_enabled: boolean
          author_id: string | null
          comment_count: number
          content: Json
          content_text: string
          cover_image: string | null
          created_at: string
          deleted_at: string | null
          draft_content: Json | null
          draft_saved_at: string | null
          draft_title: string | null
          hidden_at: string | null
          hot_rank: number | null
          id: string
          is_pinned: boolean
          lesson_no: number | null
          menu_id: string | null
          published_at: string | null
          score: number
          slug: string
          sort_order: number
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_discussion_enabled?: boolean
          author_id?: string | null
          comment_count?: number
          content?: Json
          content_text?: string
          cover_image?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_content?: Json | null
          draft_saved_at?: string | null
          draft_title?: string | null
          hidden_at?: string | null
          hot_rank?: number | null
          id?: string
          is_pinned?: boolean
          lesson_no?: number | null
          menu_id?: string | null
          published_at?: string | null
          score?: number
          slug: string
          sort_order?: number
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_discussion_enabled?: boolean
          author_id?: string | null
          comment_count?: number
          content?: Json
          content_text?: string
          cover_image?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_content?: Json | null
          draft_saved_at?: string | null
          draft_title?: string | null
          hidden_at?: string | null
          hot_rank?: number | null
          id?: string
          is_pinned?: boolean
          lesson_no?: number | null
          menu_id?: string | null
          published_at?: string | null
          score?: number
          slug?: string
          sort_order?: number
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          guardian_consented_at: string | null
          guardian_email: string | null
          id: string
          is_under_14: boolean
          last_login_at: string | null
          name: string | null
          nickname: string
          privacy_agreed_at: string
          role: string
          status: string
          teacher_position: string | null
          teacher_reject_reason: string | null
          teacher_requested_at: string | null
          teacher_reviewed_at: string | null
          teacher_school: string | null
          teacher_status: string
          teacher_subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          guardian_consented_at?: string | null
          guardian_email?: string | null
          id: string
          is_under_14: boolean
          last_login_at?: string | null
          name?: string | null
          nickname: string
          privacy_agreed_at: string
          role?: string
          status?: string
          teacher_position?: string | null
          teacher_reject_reason?: string | null
          teacher_requested_at?: string | null
          teacher_reviewed_at?: string | null
          teacher_school?: string | null
          teacher_status?: string
          teacher_subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          guardian_consented_at?: string | null
          guardian_email?: string | null
          id?: string
          is_under_14?: boolean
          last_login_at?: string | null
          name?: string | null
          nickname?: string
          privacy_agreed_at?: string
          role?: string
          status?: string
          teacher_position?: string | null
          teacher_reject_reason?: string | null
          teacher_requested_at?: string | null
          teacher_reviewed_at?: string | null
          teacher_school?: string | null
          teacher_status?: string
          teacher_subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      board_content_problem: {
        Args: { p_blocks: Json; p_depth?: number; p_uid: string }
        Returns: string
      }
      board_inline_problem: {
        Args: { p_allow_links: boolean; p_content: Json }
        Returns: string
      }
      board_target_post_id: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: string
      }
      board_upload_daily_limit: { Args: never; Returns: number }
      can_comment: { Args: { p_post_id: string }; Returns: boolean }
      can_report: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: boolean
      }
      can_vote: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: boolean
      }
      can_write_board: { Args: { p_menu_id: string }; Returns: boolean }
      cast_vote: {
        Args: { p_target_id: string; p_target_type: string; p_value: number }
        Returns: {
          my_vote: number
          score: number
        }[]
      }
      consume_otp_attempt: {
        Args: { p_delta?: number; p_email_hash: string }
        Returns: number
      }
      create_board_post: {
        Args: {
          p_content: Json
          p_content_text: string
          p_menu_id: string
          p_slug: string
          p_title: string
          p_upload_paths: string[]
        }
        Returns: string
      }
      current_user_role: { Args: never; Returns: string }
      get_post_editor_content: {
        Args: { p_post_id: string }
        Returns: {
          content: Json
          draft_content: Json
          draft_title: string
        }[]
      }
      give_guardian_consent: { Args: { p_token_hash: string }; Returns: string }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_member_request: { Args: never; Returns: boolean }
      issue_guardian_token: {
        Args: {
          p_cooldown_seconds: number
          p_daily_limit: number
          p_expires_at: string
          p_profile_id: string
          p_token_hash: string
        }
        Returns: string
      }
      open_board_post_menu: {
        Args: { p_post_id: string }
        Returns: {
          allow_comments: boolean
          allow_votes: boolean
        }[]
      }
      post_hot_rank: {
        Args: { p_created_at: string; p_score: number }
        Returns: number
      }
      purge_expired_accounts: { Args: never; Returns: undefined }
      reorder_menus: {
        Args: { p_ids: string[]; p_parent_id?: string }
        Returns: undefined
      }
      reorder_posts: {
        Args: { p_ids: string[]; p_menu_id: string }
        Returns: undefined
      }
      resolve_report: {
        Args: { p_action: string; p_report_id: string }
        Returns: undefined
      }
      role_rank: { Args: { p_role: string }; Returns: number }
      search_posts: {
        Args: { p_limit?: number; p_menu_id?: string; p_query: string }
        Returns: {
          id: string
          lesson_no: number
          menu_id: string
          published_at: string
          slug: string
          snippet: string
          summary: string
          title: string
          title_match: boolean
        }[]
      }
      update_board_post: {
        Args: {
          p_content: Json
          p_content_text: string
          p_post_id: string
          p_title: string
          p_upload_paths: string[]
        }
        Returns: undefined
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
