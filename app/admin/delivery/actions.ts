"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/components/form-message";
export async function reconcileDelivery(orgId:string,key:string,_previous:FormState,form:FormData):Promise<FormState> {
  const {email}=await requirePlatformAdmin();
  const decision=String(form.get("decision")??""); const evidence=String(form.get("evidence")??"").trim(); const sid=String(form.get("sid")??"").trim();
  if(!["accepted","rejected"].includes(decision)||evidence.length<10||evidence.length>2000||(decision==="accepted"&&!sid)) return {error:"Record the provider receipt and evidence of acceptance or rejection."};
  const {data,error}=await createAdminClient().rpc("reconcile_sms_attempt",{p_org_id:orgId,p_key:key,p_decision:decision,p_evidence:evidence,p_actor:email,p_sid:sid||undefined});
  if(error||!data) return {error:"This attempt changed or is still in progress. Refresh and review the provider receipt."};
  revalidatePath("/admin/delivery"); return {success:"Evidence recorded. No text was resent."};
}
