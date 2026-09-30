import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
export async function loadDeliveryQueue() {
 const {data,error}=await createAdminClient().from("sms_attempts").select("org_id,request_key,message_id,state,created_at").in("state",["submitting","unknown"]).lt("created_at",new Date(Date.now()-120000).toISOString()).order("created_at").limit(100);
 if(error) throw new Error("Could not load delivery review queue");
 return data ?? [];
}
