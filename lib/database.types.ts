/**
 * Database types, in the same shape `supabase gen types typescript` produces.
 * Hand-written for now. Once you have a Supabase project linked, regenerate
 * with: npx supabase gen types typescript --linked > lib/database.types.ts
 * (then re-add the helper types at the bottom if the generator drops them).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      plans: {
        Row: {
          id: string;
          name: string;
          monthly_price_cents: number;
          stripe_price_id: string | null;
          max_users: number;
          max_phone_numbers: number;
          monthly_sms_limit: number;
          feature_recurring_customers: boolean;
          feature_bulk_messaging: boolean;
          feature_campaigns: boolean;
          is_public: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          business_type: "project" | "recurring";
          timezone: string;
          default_language: "en" | "es";
          alert_phone: string | null;
          google_review_url: string | null;
          settings: Json;
          plan_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          business_type?: "project" | "recurring";
          timezone?: string;
          default_language?: "en" | "es";
          alert_phone?: string | null;
          google_review_url?: string | null;
          settings?: Json;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { full_name?: string | null };
        Relationships: [];
      };
      memberships: {
        Row: {
          org_id: string;
          user_id: string;
          role: "owner" | "manager";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          token: string;
          role: "manager";
          created_by: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
        };
        Insert: { org_id: string; role?: "manager" };
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          org_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: "manual" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
          current_period_end: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      message_templates: {
        Row: {
          id: string;
          org_id: string;
          key: string;
          language: "en" | "es";
          category: "conversational" | "informational" | "marketing";
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          key: string;
          language: "en" | "es";
          category: "conversational" | "informational" | "marketing";
          body: string;
        };
        Update: { body?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: {
          p_name: string;
          p_business_type: string;
          p_default_language: string;
          p_alert_phone: string | null;
          p_google_review_url: string | null;
          p_templates: Json;
        };
        Returns: string;
      };
      get_invitation: {
        Args: { p_token: string };
        Returns: { org_name: string; role: string; is_valid: boolean }[];
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      is_org_member: { Args: { p_org_id: string }; Returns: boolean };
      has_org_role: { Args: { p_org_id: string; p_role: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
