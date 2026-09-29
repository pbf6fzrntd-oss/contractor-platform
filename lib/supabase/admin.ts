import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Admin database client: BYPASSES row-level security.
 * Only for webhooks, the scheduler and trusted server code that has already
 * worked out which business it's acting for. Always filter by org_id.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
