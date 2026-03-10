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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_integrations: {
        Row: {
          api_key_encrypted: string | null
          api_key_iv: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_iv?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_iv?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_shares: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          permission: string
          shared_by: string | null
          shared_with_email: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          permission?: string
          shared_by?: string | null
          shared_with_email: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          permission?: string
          shared_by?: string | null
          shared_with_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean | null
          organization_id: string
          share_token: string | null
          title: string
          updated_at: string
          vault_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean | null
          organization_id: string
          share_token?: string | null
          title?: string
          updated_at?: string
          vault_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean | null
          organization_id?: string
          share_token?: string | null
          title?: string
          updated_at?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          version_number: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          version_number: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          organization_id: string
          title: string
          updated_at: string
          vault_id: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          organization_id: string
          title?: string
          updated_at?: string
          vault_id?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      file_chunks: {
        Row: {
          char_end: number | null
          char_start: number | null
          chunk_index: number
          content: string
          created_at: string
          embedding_id: string | null
          file_id: string
          id: string
          organization_id: string
          page_number: number | null
          qdrant_point_id: string | null
          token_count: number | null
        }
        Insert: {
          char_end?: number | null
          char_start?: number | null
          chunk_index: number
          content: string
          created_at?: string
          embedding_id?: string | null
          file_id: string
          id?: string
          organization_id: string
          page_number?: number | null
          qdrant_point_id?: string | null
          token_count?: number | null
        }
        Update: {
          char_end?: number | null
          char_start?: number | null
          chunk_index?: number
          content?: string
          created_at?: string
          embedding_id?: string | null
          file_id?: string
          id?: string
          organization_id?: string
          page_number?: number | null
          qdrant_point_id?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "file_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          chunk_count: number | null
          created_at: string
          error_message: string | null
          extracted_text: string | null
          extracted_text_r2_key: string | null
          id: string
          mime_type: string
          name: string
          ocr_used: boolean | null
          organization_id: string
          original_name: string
          page_count: number | null
          size_bytes: number
          status: Database["public"]["Enums"]["file_status"]
          storage_path: string
          tags: string[] | null
          updated_at: string
          uploaded_by: string | null
          vault_id: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          extracted_text_r2_key?: string | null
          id?: string
          mime_type: string
          name: string
          ocr_used?: boolean | null
          organization_id: string
          original_name: string
          page_count?: number | null
          size_bytes: number
          status?: Database["public"]["Enums"]["file_status"]
          storage_path: string
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          vault_id: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          extracted_text_r2_key?: string | null
          id?: string
          mime_type?: string
          name?: string
          ocr_used?: boolean | null
          organization_id?: string
          original_name?: string
          page_count?: number | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["file_status"]
          storage_path?: string
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_global: boolean | null
          organization_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_configs: {
        Row: {
          api_key_encrypted: string
          api_key_iv: string
          base_url: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_tokens: number | null
          model_id: string
          organization_id: string | null
          provider: Database["public"]["Enums"]["llm_provider"]
          temperature: number | null
          updated_at: string
          use_case: Database["public"]["Enums"]["llm_use_case"]
        }
        Insert: {
          api_key_encrypted: string
          api_key_iv: string
          base_url?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_tokens?: number | null
          model_id: string
          organization_id?: string | null
          provider: Database["public"]["Enums"]["llm_provider"]
          temperature?: number | null
          updated_at?: string
          use_case: Database["public"]["Enums"]["llm_use_case"]
        }
        Update: {
          api_key_encrypted?: string
          api_key_iv?: string
          base_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_tokens?: number | null
          model_id?: string
          organization_id?: string | null
          provider?: Database["public"]["Enums"]["llm_provider"]
          temperature?: number | null
          updated_at?: string
          use_case?: Database["public"]["Enums"]["llm_use_case"]
        }
        Relationships: [
          {
            foreignKeyName: "llm_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_feedback: {
        Row: {
          conversation_id: string
          created_at: string
          feedback: string
          id: string
          message_id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          feedback: string
          id?: string
          message_id: string
          organization_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          feedback?: string
          id?: string
          message_id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          citations: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          model_used: string | null
          organization_id: string
          role: string
          sources: Json | null
          tokens_used: number | null
        }
        Insert: {
          citations?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          organization_id: string
          role: string
          sources?: Json | null
          tokens_used?: number | null
        }
        Update: {
          citations?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          organization_id?: string
          role?: string
          sources?: Json | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          max_files: number
          max_storage_gb: number
          max_users: number
          name: string
          plan: Database["public"]["Enums"]["org_plan"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_files?: number
          max_storage_gb?: number
          max_users?: number
          name: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_files?: number
          max_storage_gb?: number
          max_users?: number
          name?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      red_flag_analyses: {
        Row: {
          created_at: string
          created_by: string | null
          file_id: string
          flags: Json | null
          id: string
          model_used: string | null
          organization_id: string
          risk_score: number | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_id: string
          flags?: Json | null
          id?: string
          model_used?: string | null
          organization_id: string
          risk_score?: number | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_id?: string
          flags?: Json | null
          id?: string
          model_used?: string | null
          organization_id?: string
          risk_score?: number | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_flag_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_analyses_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_columns: {
        Row: {
          column_order: number
          created_at: string
          extraction_query: string
          id: string
          name: string
          review_table_id: string
        }
        Insert: {
          column_order?: number
          created_at?: string
          extraction_query: string
          id?: string
          name: string
          review_table_id: string
        }
        Update: {
          column_order?: number
          created_at?: string
          extraction_query?: string
          id?: string
          name?: string
          review_table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_columns_review_table_id_fkey"
            columns: ["review_table_id"]
            isOneToOne: false
            referencedRelation: "review_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      review_rows: {
        Row: {
          created_at: string
          file_id: string
          id: string
          review_table_id: string
          status: string
          updated_at: string
          values: Json
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          review_table_id: string
          status?: string
          updated_at?: string
          values?: Json
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          review_table_id?: string
          status?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "review_rows_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_rows_review_table_id_fkey"
            columns: ["review_table_id"]
            isOneToOne: false
            referencedRelation: "review_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      review_tables: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          vault_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          vault_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_tables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_tables_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_shares: {
        Row: {
          created_at: string
          id: string
          permission: string
          shared_by: string | null
          shared_with_email: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: string
          shared_by?: string | null
          shared_with_email: string
          vault_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          shared_by?: string | null
          shared_with_email?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_shares_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaults_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaults_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_shared_with_user: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "member" | "admin" | "superadmin"
      file_status: "uploading" | "processing" | "ready" | "error"
      llm_provider:
        | "anthropic"
        | "openai"
        | "google"
        | "mistral"
        | "cohere"
        | "custom"
      llm_use_case: "chat" | "analysis" | "extraction" | "embedding" | "summary"
      org_plan: "trial" | "starter" | "professional" | "enterprise"
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
      app_role: ["member", "admin", "superadmin"],
      file_status: ["uploading", "processing", "ready", "error"],
      llm_provider: [
        "anthropic",
        "openai",
        "google",
        "mistral",
        "cohere",
        "custom",
      ],
      llm_use_case: ["chat", "analysis", "extraction", "embedding", "summary"],
      org_plan: ["trial", "starter", "professional", "enterprise"],
    },
  },
} as const
