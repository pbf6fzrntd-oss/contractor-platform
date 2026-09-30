"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { bookingIdFromToken, manageToken } from "@/lib/booking/manage-link";
import { allowPublicRequest, visitorHash } from "@/lib/public/rate-limit";
import { cancelByCustomer, loadManagedBooking, rescheduleByCustomer } from "@/lib/services/booking-manage";
import { createAdminClient } from "@/lib/supabase/admin";

/** Finds the booking from the signed link only, and applies the public rate limit. */
async function load(token: string) {
  const id = bookingIdFromToken(token);
  if (!id) return { error: "This link isn't valid." } as const;
  const db = createAdminClient();
  const m = await loadManagedBooking(db, id);
  if (!m) return { error: "This link isn't valid." } as const;
  if (!(await allowPublicRequest(db, m.org.id, visitorHash(await headers()), "booking"))) {
    return { error: "Too many changes. Please wait a bit, or call or text the business." } as const;
  }
  return { db, m } as const;
}

export async function cancelBooking(token: string, lang: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("sure") !== "yes") return { error: "Tick the box to confirm you want to cancel." };
  const r = await load(token);
  if ("error" in r) return { error: r.error };
  const result = await cancelByCustomer(r.db, r.m);
  if (!result.ok) return { error: result.error ?? "Something went wrong. Please call or text the business." };
  redirect(`/m/${token}?done=canceled${lang === "es" ? "&lang=es" : ""}`);
}

export async function moveBooking(token: string, lang: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const r = await load(token);
  if ("error" in r) return { error: r.error };
  let choice: Record<string, unknown> = {};
  try {
    choice = JSON.parse(String(formData.get("choice") ?? "{}"));
  } catch {
    choice = {};
  }
  const pick = (k: string) => {
    const v = String(formData.get(k) ?? "").trim() || (typeof choice[k] === "string" ? (choice[k] as string) : "");
    return v || undefined;
  };
  const start = Number(pick("start_ms"));
  const result = await rescheduleByCustomer(r.db, r.m, {
    startMs: Number.isFinite(start) && start > 0 ? start : undefined,
    date: pick("date"),
    checkIn: pick("check_in"),
    checkOut: pick("check_out"),
  });
  if (!result.ok) return { error: result.error };
  // The new booking has its own link; send the customer there.
  const q = new URLSearchParams({ done: result.status === "pending_approval" ? "requested" : "moved", ...(lang === "es" ? { lang } : {}) });
  redirect(`/m/${manageToken(result.bookingId)}?${q}`);
}
