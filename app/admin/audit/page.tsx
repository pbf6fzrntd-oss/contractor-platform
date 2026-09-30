import type { Metadata } from "next";
import Link from "next/link";
import { getIndustry } from "@/lib/industries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Sales audits" };

/** Founder-only list of agent-readiness audits run on sales calls. */
export default async function AuditsPage() {
  const { data: audits } = await createAdminClient()
    .from("audit_reports")
    .select("id, prospect_name, industry, score, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales audits</h1>
          <p className="text-sm text-slate-600">Agent-readiness audits for prospects. Private to you; never shown publicly.</p>
        </div>
        <Link href="/admin/audit/new" className="btn-primary shrink-0 px-4">New audit</Link>
      </div>
      {(audits ?? []).length === 0 ? (
        <p className="card text-slate-600">No audits yet. Run one during your next sales call.</p>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {(audits ?? []).map((a) => (
            <li key={a.id}>
              <Link href={`/admin/audit/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-medium">{a.prospect_name}</span>
                  <span className="block text-sm text-slate-500">
                    {getIndustry(a.industry)?.label ?? "Local business"} · {fmt.format(new Date(a.created_at))}
                  </span>
                </span>
                <span className="text-xl font-bold">{a.score}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
