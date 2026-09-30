import type { Org } from "@/lib/org";
import { summarizeSources } from "@/lib/reports/sources";
import { createClient } from "@/lib/supabase/server";

/** Where leads and bookings came from in the last 90 days. */
export async function SourcesSection({ org }: { org: Org }) {
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 90 * 86_400_000).toISOString();
  const [{ data: leads }, { data: bookings }] = await Promise.all([
    supabase.from("leads").select("source, stage").eq("org_id", org.id).gte("created_at", since).limit(5000),
    supabase.from("bookings").select("source, status").eq("org_id", org.id).gte("created_at", since).limit(5000),
  ]);
  const rows = summarizeSources(leads ?? [], bookings ?? []);
  if (!rows.length) return null;
  const showBookings = (bookings ?? []).length > 0;
  return (
    <section className="card">
      <h2 className="font-semibold">Where your work came from</h2>
      <p className="mb-2 text-sm text-slate-600">Last 90 days</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 font-medium">Source</th>
            <th className="py-1 text-right font-medium">Leads</th>
            <th className="py-1 text-right font-medium">Won</th>
            {showBookings && <th className="py-1 text-right font-medium">Bookings</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 text-right">{r.leads}</td>
              <td className="py-1.5 text-right">{r.won}</td>
              {showBookings && <td className="py-1.5 text-right">{r.bookings}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
