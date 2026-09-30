import type { Metadata } from "next";
import Link from "next/link";
import { REGISTRATION_STATUS_TEXT } from "@/lib/automation/a2p";
import { formatUSPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const db = createAdminClient();
  const [{ data: orgs }, { data: regs }, { data: phones }, { data: subs }] = await Promise.all([
    // "Try it live" demo businesses are left out (they delete themselves after a day).
    db.from("organizations").select("id, name, business_type, plan_id, created_at").eq("is_demo", false).order("created_at", { ascending: false }).limit(500),
    db.from("a2p_registrations").select("org_id, status"),
    db.from("phone_numbers").select("org_id, e164, provider"),
    db.from("subscriptions").select("org_id, status"),
  ]);
  const by = <T extends { org_id: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.org_id, r]));
  const reg = by(regs);
  const phone = by(phones);
  const sub = by(subs);
  const waiting = (regs ?? []).filter((r) => r.status === "submitted").length;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Businesses ({orgs?.length ?? 0})</h1>
      <p className="mb-4 text-sm text-slate-600">
        {waiting ? `${waiting} carrier registration(s) waiting for you to submit in Twilio.` : "No registrations waiting."}
      </p>
      <ul className="card divide-y divide-slate-100 p-0">
        {(orgs ?? []).map((o) => {
          const r = reg.get(o.id);
          const p = phone.get(o.id);
          return (
            <li key={o.id}>
              <Link href={`/admin/${o.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{o.name}</span>{" "}
                  <span className="text-sm text-slate-500">
                    {o.business_type === "recurring" ? "Lawn" : "Trade"} · {o.plan_id} · {sub.get(o.id)?.status ?? "manual"}
                  </span>
                </span>
                <span className="text-sm">
                  {p ? `${formatUSPhone(p.e164)}${p.provider === "simulator" ? " (sim)" : ""}` : "no number"} ·{" "}
                  <span className={r?.status === "submitted" ? "font-semibold text-amber-700" : "text-slate-600"}>
                    {r?.status ?? "not_started"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Status key: {Object.entries(REGISTRATION_STATUS_TEXT).map(([k, v]) => `${k} = ${v}`).join("; ")}</p>
    </>
  );
}
