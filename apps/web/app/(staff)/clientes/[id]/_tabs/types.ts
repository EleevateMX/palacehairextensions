import type { CurrentStaff } from "@/lib/staff";
import type { createClient } from "@/lib/supabase/server";

export type DB = Awaited<ReturnType<typeof createClient>>;

export interface ClientRow {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  acquisition_channel: string | null;
  preferred_staff_id: string | null;
  hair_tone: string | null;
  extension_technique: string | null;
  extension_length_cm: number | string | null;
  style_preferences: string | null;
  maintenance_notes: string | null;
  next_visit_suggested: string | null;
  is_anonymized: boolean;
  created_at: string;
}

export interface TabProps {
  supabase: DB;
  staff: CurrentStaff;
  client: ClientRow;
}
