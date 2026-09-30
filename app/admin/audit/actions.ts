"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { buildAuditReport, type CallAnswers, type CheckStatus } from "@/lib/audit/checks";
import { auditWebsite } from "@/lib/audit/fetch";
import { EMPTY_FINDINGS, type WebsiteFindings } from "@/lib/audit/website";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { getIndustry } from "@/lib/industries";
import { normalizeUSPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES: CheckStatus[] = ["pass", "fail", "unknown"];

/** Reads every "answer_<key>" field the founder filled in on the call. */
function readAnswers(formData: FormData): CallAnswers {
  const answers: CallAnswers = {};
  for (const [name, value] of formData.entries()) {
    const key = name.startsWith("answer_") ? name.slice(7) : null;
    if (key && /^[a-z0-9_]{1,40}$/.test(key) && STATUSES.includes(value as CheckStatus)) answers[key] = value as CheckStatus;
  }
  return answers;
}

export async function createAudit(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requirePlatformAdmin();
  const name = String(formData.get("prospect_name") ?? "").trim().slice(0, 120);
  if (!name) return { error: "Enter the business name." };
  const industryKey = String(formData.get("industry") ?? "");
  const industry = getIndustry(industryKey);
  const website = String(formData.get("website") ?? "").trim();
  const phoneInput = String(formData.get("contact_phone") ?? "").trim();
  const phone = phoneInput ? normalizeUSPhone(phoneInput) : null;
  if (phoneInput && !phone) return { error: "Enter a 10-digit US phone number, or leave it blank." };

  const { findings, error } = website ? await auditWebsite(website) : { findings: EMPTY_FINDINGS, error: "No website given." };
  const answers = readAnswers(formData);
  const report = buildAuditReport({ industry: industry?.key ?? null, findings, answers });

  const { data, error: dbError } = await createAdminClient()
    .from("audit_reports")
    .insert({
      prospect_name: name,
      industry: industry?.key ?? null,
      website_url: website.slice(0, 500) || null,
      contact_phone: phone,
      findings,
      answers,
      score: report.score,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 4000) || null,
      fetch_error: error ?? null,
      created_by_email: email,
    })
    .select("id")
    .single();
  if (dbError || !data) return { error: "Couldn't save the audit. Try again." };
  redirect(`/admin/audit/${data.id}`);
}

/** Updates answers after the call (or when the prospect fixes something) and re-scores. */
export async function updateAuditAnswers(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const { data: row } = await db.from("audit_reports").select("industry, findings, answers").eq("id", id).maybeSingle();
  if (!row) return { error: "Audit not found." };
  const answers = { ...(row.answers as CallAnswers), ...readAnswers(formData) };
  const report = buildAuditReport({ industry: row.industry, findings: { ...EMPTY_FINDINGS, ...(row.findings as Partial<WebsiteFindings>) }, answers });
  await db
    .from("audit_reports")
    .update({ answers, score: report.score, notes: String(formData.get("notes") ?? "").trim().slice(0, 4000) || null })
    .eq("id", id);
  revalidatePath(`/admin/audit/${id}`);
  return { success: `Saved. New score: ${report.score}.` };
}
