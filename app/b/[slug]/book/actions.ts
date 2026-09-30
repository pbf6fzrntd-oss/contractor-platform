"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { bookingConsentText } from "@/lib/public/consent";
import { allowPublicRequest, visitorHash } from "@/lib/public/rate-limit";
import { requestPublicBooking } from "@/lib/services/public-booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicBusiness } from "../data";

/** A customer books from the public page. Goes through the same rules, approvals and texting rules as everything else. */
export async function publicBook(slug: string, serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const biz = await getPublicBusiness(slug);
  if (!biz) return { error: "This booking page isn't available." };
  if (formData.get("consent") !== "on") return { error: "Please agree to get texts about your booking, so the business can confirm it." };
  if (String(formData.get("website") ?? "")) return { error: "Something went wrong. Please try again." }; // honeypot for bots
  const db = createAdminClient();
  if (!(await allowPublicRequest(db, biz.org.id, visitorHash(await headers()), "booking"))) {
    return { error: "Too many booking requests. Please wait a bit, or call or text the business." };
  }
  const lang = formData.get("language") === "es" ? "es" : "en";
  // The picked time arrives as one JSON value (works without JavaScript); only known keys are used.
  let choice: Record<string, unknown> = {};
  try {
    choice = JSON.parse(String(formData.get("choice") ?? "{}"));
  } catch {
    choice = {};
  }
  const fromChoice = (k: string) => (typeof choice[k] === "string" ? (choice[k] as string) : "");
  const str = (k: string) => String(formData.get(k) ?? "").trim() || fromChoice(k).trim() || undefined;
  const start = Number(str("start_ms"));
  const result = await requestPublicBooking(db, biz, {
    serviceId,
    startMs: Number.isFinite(start) && start > 0 ? start : undefined,
    date: str("date"),
    checkIn: str("check_in"),
    checkOut: str("check_out"),
    name: str("name") ?? "",
    phone: str("phone") ?? "",
    zip: str("zip") ?? null,
    notes: str("notes") ?? null,
    language: lang,
    consentText: bookingConsentText(biz.profile.name, lang),
    channel: "customer_link",
  });
  if (!result.ok) return { error: result.error };
  const q = new URLSearchParams({ ref: result.reference, status: result.status, when: result.when, texted: result.texted ? "1" : "0" });
  redirect(`/b/${slug}/book/done?${q}`);
}
