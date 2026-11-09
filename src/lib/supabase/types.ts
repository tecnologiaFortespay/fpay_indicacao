
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_reviews": {
                  Row: {
                    "alerts": NonNullable<Json>,"batch_id": string | null,"closing_id": string | null,"created_at": string,"created_by": string,"error": string | null,"finished_at": string | null,"id": string,"model": string | null,"status": string,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alerts"?: NonNullable<Json>,"batch_id"?: string | null,"closing_id"?: string | null,"created_at"?: string,"created_by": string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"model"?: string | null,"status"?: string,"summary"?: string | null
                  }
                  Update: {
                    "alerts"?: NonNullable<Json>,"batch_id"?: string | null,"closing_id"?: string | null,"created_at"?: string,"created_by"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"model"?: string | null,"status"?: string,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_reviews_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_reviews_closing_id_fkey"
      columns: ["closing_id"]
isOneToOne: false
      referencedRelation: "closings"
      referencedColumns: ["id"]
    }
                  ]
                },"closing_items": {
                  Row: {
                    "adjustment": number,"adjustment_note": string | null,"closing_id": string,"decided_at": string | null,"decided_by": string | null,"decision": string | null,"id": string,"lives": number,"month_amount": number,"partner_id": string,"partner_note": string | null,"partner_response": string | null,"partner_response_at": string | null,"payment_note": string | null,"previous_balance": number,"total": number | null,"value_per_life": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment"?: number,"adjustment_note"?: string | null,"closing_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string | null,"id"?: string,"lives"?: number,"month_amount"?: number,"partner_id": string,"partner_note"?: string | null,"partner_response"?: string | null,"partner_response_at"?: string | null,"payment_note"?: string | null,"previous_balance"?: number,"total"?: never,"value_per_life"?: number | null
                  }
                  Update: {
                    "adjustment"?: number,"adjustment_note"?: string | null,"closing_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string | null,"id"?: string,"lives"?: number,"month_amount"?: number,"partner_id"?: string,"partner_note"?: string | null,"partner_response"?: string | null,"partner_response_at"?: string | null,"payment_note"?: string | null,"previous_balance"?: number,"total"?: never,"value_per_life"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "closing_items_closing_id_fkey"
      columns: ["closing_id"]
isOneToOne: false
      referencedRelation: "closings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "closing_items_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"closings": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"competency": string,"id": string,"prepared_at": string,"prepared_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"competency": string,"id"?: string,"prepared_at"?: string,"prepared_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"competency"?: string,"id"?: string,"prepared_at"?: string,"prepared_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "cnpj": string,"first_competency": string | null,"group_name": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cnpj": string,"first_competency"?: string | null,"group_name"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "cnpj"?: string,"first_competency"?: string | null,"group_name"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"import_batches": {
                  Row: {
                    "competencies": (string)[],"created_at": string,"created_by": string,"file_hash": string,"file_name": string,"id": string,"rows_ignored": number,"rows_imported": number,"rows_read": number,"rows_skipped": number
                  }
                  ComputedFields: never
                  Insert: {
                    "competencies"?: (string)[],"created_at"?: string,"created_by": string,"file_hash": string,"file_name": string,"id"?: string,"rows_ignored"?: number,"rows_imported"?: number,"rows_read"?: number,"rows_skipped"?: number
                  }
                  Update: {
                    "competencies"?: (string)[],"created_at"?: string,"created_by"?: string,"file_hash"?: string,"file_name"?: string,"id"?: string,"rows_ignored"?: number,"rows_imported"?: number,"rows_read"?: number,"rows_skipped"?: number
                  }
                  Relationships: [
                    
                  ]
                },"import_rows": {
                  Row: {
                    "batch_id": string,"id": number,"line_number": number,"outcome": string,"raw_line": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"id"?: never,"line_number": number,"outcome": string,"raw_line": string,"reason": string
                  }
                  Update: {
                    "batch_id"?: string,"id"?: never,"line_number"?: number,"outcome"?: string,"raw_line"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string,"id": string,"kind": string,"partner_id": string | null,"partner_name": string,"token_hash": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"expires_at": string,"id"?: string,"kind": string,"partner_id"?: string | null,"partner_name": string,"token_hash": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"id"?: string,"kind"?: string,"partner_id"?: string | null,"partner_name"?: string,"token_hash"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_lives": {
                  Row: {
                    "batch_id": string,"cnpj": string,"competency": string,"imported_at": string,"lives": number
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"cnpj": string,"competency": string,"imported_at"?: string,"lives": number
                  }
                  Update: {
                    "batch_id"?: string,"cnpj"?: string,"competency"?: string,"imported_at"?: string,"lives"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_lives_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_lives_cnpj_fkey"
      columns: ["cnpj"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["cnpj"]
    }
                  ]
                },"partner_rules": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"partner_id": string,"term_months": number | null,"valid_from": string,"value_per_life": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"partner_id": string,"term_months"?: number | null,"valid_from": string,"value_per_life": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"partner_id"?: string,"term_months"?: number | null,"valid_from"?: string,"value_per_life"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_rules_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"partners": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"city": string | null,"contact_email": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"created_by": string | null,"id": string,"kind": string,"name": string,"rejection_reason": string | null,"state": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"city"?: string | null,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"name": string,"rejection_reason"?: string | null,"state"?: string | null,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"city"?: string | null,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"rejection_reason"?: string | null,"state"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"partner_id": string | null,"password_reset_expires_at": string | null,"password_reset_hash": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"partner_id"?: string | null,"password_reset_expires_at"?: string | null,"password_reset_hash"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"partner_id"?: string | null,"password_reset_expires_at"?: string | null,"password_reset_hash"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"referrals": {
                  Row: {
                    "activated_competency": string | null,"cnpj": string,"company_name": string,"created_at": string,"created_by": string | null,"estimated_lives": number | null,"id": string,"partner_id": string,"status": string,"status_changed_at": string,"term_months": number | null,"value_per_life": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_competency"?: string | null,"cnpj": string,"company_name": string,"created_at"?: string,"created_by"?: string | null,"estimated_lives"?: number | null,"id"?: string,"partner_id": string,"status"?: string,"status_changed_at"?: string,"term_months"?: number | null,"value_per_life"?: number | null
                  }
                  Update: {
                    "activated_competency"?: string | null,"cnpj"?: string,"company_name"?: string,"created_at"?: string,"created_by"?: string | null,"estimated_lives"?: number | null,"id"?: string,"partner_id"?: string,"status"?: string,"status_changed_at"?: string,"term_months"?: number | null,"value_per_life"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "referrals_cnpj_fkey"
      columns: ["cnpj"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["cnpj"]
    },{
      foreignKeyName: "referrals_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "partner_month_amounts": {
                  Row: {
                    "amount": number | null,"competency": string,"lives": number | null,"partner_id": string,"value_per_life": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "referrals_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"referral_month_lives": {
                  Row: {
                    "amount": number | null,"cnpj": string,"competency": string,"lives": number,"partner_id": string,"referral_id": string,"term_months": number | null,"value_per_life": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "referrals_cnpj_fkey"
      columns: ["cnpj"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["cnpj"]
    },{
      foreignKeyName: "referrals_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "approve_partner":
{ Args: { "payload": Json }; Returns: undefined
                           },
"close_closing":
{ Args: { "paid_partner_ids": (string)[],"target": string }; Returns: undefined
                           },
"closing_blocker":
{ Args: { "month": string }; Returns: string
                           },
"closing_is_closed":
{ Args: { "target": string }; Returns: boolean
                           },
"confirm_invited_signup":
{ Args: { "account": string,"secret": string }; Returns: boolean
                           },
"create_invitation":
{ Args: { "payload": Json }; Returns: string
                           },
"create_password_reset":
{ Args: { "secret": string,"target": string }; Returns: string
                           },
"create_referral":
{ Args: { "payload": Json }; Returns: string
                           },
"current_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"current_role_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_partner_rule":
{ Args: { "target": string }; Returns: undefined
                           },
"finish_ai_review":
{ Args: { "payload": Json,"review": string }; Returns: undefined
                           },
"import_lives":
{ Args: { "batch": Json,"rows": Json }; Returns: string
                           },
"invitation_preview":
{ Args: { "secret": string }; Returns: Json
                           },
"invitation_token_hash":
{ Args: { "secret": string }; Returns: string
                           },
"is_closed_competency":
{ Args: { "month": string }; Returns: boolean
                           },
"is_director":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"last_import_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"latest_complete_competency":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_partner_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"optional_term_months":
{ Args: { "value": string }; Returns: number
                           },
"optional_value_per_life":
{ Args: { "value": string }; Returns: number
                           },
"partner_has_closing_item":
{ Args: { "target": string }; Returns: boolean
                           },
"password_reset_preview":
{ Args: { "secret": string }; Returns: Json
                           },
"prepare_closing":
{ Args: { "month": string }; Returns: string
                           },
"preview_import":
{ Args: { "batch": Json,"rows": Json }; Returns: Json
                           },
"register_partner":
{ Args: { "payload": Json,"secret": string }; Returns: string
                           },
"reject_partner":
{ Args: { "reason": string,"target": string }; Returns: undefined
                           },
"reset_password_with_token":
{ Args: { "password": string,"secret": string }; Returns: undefined
                           },
"respond_closing_item":
{ Args: { "note": string,"response": string,"target": string }; Returns: undefined
                           },
"save_partner":
{ Args: { "payload": Json }; Returns: string
                           },
"save_partner_rule":
{ Args: { "payload": Json }; Returns: string
                           },
"set_closing_adjustment":
{ Args: { "amount": number,"note": string,"target": string }; Returns: undefined
                           },
"set_payment_note":
{ Args: { "note": string,"target": string }; Returns: undefined
                           },
"set_referral_config":
{ Args: { "payload": Json,"target": string }; Returns: undefined
                           },
"set_referral_status":
{ Args: { "new_status": string,"target": string }; Returns: undefined
                           },
"start_ai_review":
{ Args: { "subject": Json }; Returns: string
                           },
"valid_cnpj":
{ Args: { "value": string }; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
