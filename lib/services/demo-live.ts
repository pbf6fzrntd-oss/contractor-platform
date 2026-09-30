import "server-only";
import { randomUUID } from "node:crypto";
import { tradeFor } from "@/lib/demo/content";
import { handleInboundSms, handleMissedCall, type BusinessLine } from "@/lib/services/inbound";
import { runDispatch } from "@/lib/services/outbox";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The "Try it" buttons in a demo business. Each one plays the customer's side
 * through the SAME code a real call or text goes through (the simulator path),
 * so what the prospect sees is exactly what their customers would get.
 */

async function demoLine(db: AdminClient, orgId: string): Promise<BusinessLine | null> {
  const [{ data: org }, { data: phone }] = await Promise.all([
    db.from("organizations").select("*").eq("id", orgId).eq("is_demo", true).maybeSingle(),
    db.from("phone_numbers").select("*").eq("org_id", orgId).eq("provider", "simulator").limit(1).maybeSingle(),
  ]);
  return org && phone ? { org, phone } : null;
}

async function newCallerNumber(db: AdminClient, orgId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const e164 = `+1843555${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("phone", e164);
    if (!count) return e164;
  }
  return `+1843555${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A new customer calls, nobody answers, they get the text-back and reply with what they need. */
export async function demoMissedCall(db: AdminClient, orgId: string): Promise<string | null> {
  const line = await demoLine(db, orgId);
  if (!line) return null;
  const from = await newCallerNumber(db, orgId);
  const { leadId } = await handleMissedCall(db, line, { from, callSid: `DEMOCA${randomUUID()}` });
  await handleInboundSms(db, line, { from, body: pick(tradeFor(line.org.industry ?? "").asks), messageSid: `DEMOSM${randomUUID()}` });
  return leadId;
}

/** A new customer texts the business number. */
export async function demoInboundText(db: AdminClient, orgId: string, spanish = false): Promise<string | null> {
  const line = await demoLine(db, orgId);
  if (!line) return null;
  const trade = tradeFor(line.org.industry ?? "");
  const result = await handleInboundSms(db, line, { from: await newCallerNumber(db, orgId), body: spanish ? pick(trade.asksEs) : pick(trade.asks), messageSid: `DEMOSM${randomUUID()}` });
  return result.leadId;
}

/** Jumps ahead: sends every scheduled text (follow-ups, reminders, review requests) now. */
export async function demoSkipAhead(db: AdminClient, orgId: string) {
  if (!(await demoLine(db, orgId))) return null;
  return runDispatch(db, { fastForwardOrgId: orgId, dueOnly: false });
}
