import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { effectiveStatus, FREQUENCY_LABEL, type Frequency } from "@/lib/automation/schedule";
import { money } from "@/lib/format";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, localDateString } from "@/lib/time";

export const metadata: Metadata = { title: "Customers" };

const TABS = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "canceled", label: "Canceled" },
] as const;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { org } = await requireAppContext("/customers");
  const { status, q } = await searchParams;
  const tab = TABS.find((t) => t.key === status)?.key ?? "active";
  const search = typeof q === "string" ? q.trim().toLowerCase() : "";
  const today = localDateString(new Date(), org.timezone);

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("recurring_services")
    .select("id, contact_id, service_type, frequency, service_day, status, paused_until, price_cents")
    .eq("org_id", org.id)
    .order("service_day")
    .limit(2000);
  const all = services ?? [];
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phone, address, opted_out_at, preferred_language")
    .in("id", [...new Set(all.map((s) => s.contact_id))]);
  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));

  const counts = { active: 0, paused: 0, canceled: 0 };
  for (const s of all) counts[effectiveStatus(s, today)] += 1;

  const rows = all
    .filter((s) => effectiveStatus(s, today) === tab)
    .filter((s) => {
      if (!search) return true;
      const c = byId.get(s.contact_id);
      return [c?.name, c?.phone, c?.address, s.service_type].some((v) => v?.toLowerCase().includes(search));
    });

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title="Customers" subtitle={`${counts.active} active`} />
        <div className="flex gap-2">
          <Link href="/customers/import" className="btn-secondary min-h-10 px-3 text-sm">
            Import
          </Link>
          <Link href="/customers/new" className="btn-primary min-h-10 px-3 text-sm">
            + Add
          </Link>
        </div>
      </div>

      <form className="mb-3" role="search">
        <input type="hidden" name="status" value={tab} />
        <input name="q" defaultValue={search} placeholder="Search name, phone, address" className="input" aria-label="Search customers" />
      </form>

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1" aria-label="Customer status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/customers?status=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold ${
              t.key === tab ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="card text-center text-slate-600">
          {all.length === 0 ? "No customers yet. Add them one at a time or import a spreadsheet." : "No customers here."}
        </p>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {rows.map((s) => {
            const c = byId.get(s.contact_id);
            return (
              <li key={s.id}>
                <Link href={`/customers/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c?.name ?? (c ? formatUSPhone(c.phone) : "")}</span>
                    <span className="block truncate text-sm text-slate-600">
                      {DAY_NAMES.en[s.service_day]} · {FREQUENCY_LABEL[s.frequency as Frequency]} · {s.service_type}
                    </span>
                    {c?.address && <span className="block truncate text-xs text-slate-500">{c.address}</span>}
                  </span>
                  <span className="shrink-0 text-right text-sm text-slate-600">
                    {money(s.price_cents)}
                    {c?.preferred_language === "es" && <span className="block text-xs">ES</span>}
                    {c?.opted_out_at && <span className="block text-xs text-amber-700">opted out</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
