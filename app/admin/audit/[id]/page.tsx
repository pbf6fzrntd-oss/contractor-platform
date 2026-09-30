import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAuditReport, type AuditItem, type CallAnswers } from "@/lib/audit/checks";
import { EMPTY_FINDINGS, type WebsiteFindings } from "@/lib/audit/website";
import { APP_NAME } from "@/lib/brand";
import { getIndustry } from "@/lib/industries";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnswersForm } from "./answers-form";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Audit report", robots: { index: false, follow: false } };

const MARK: Record<AuditItem["status"], { icon: string; className: string; text: string }> = {
  pass: { icon: "✓", className: "bg-brand-50 text-brand-800", text: "Yes" },
  fail: { icon: "✗", className: "bg-red-50 text-red-800", text: "No" },
  unknown: { icon: "?", className: "bg-slate-100 text-slate-600", text: "Not checked" },
};

function ItemRow({ item }: { item: AuditItem }) {
  const m = MARK[item.status];
  return (
    <li className="flex gap-3 py-3">
      <span aria-label={m.text} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${m.className}`}>{m.icon}</span>
      <span className="min-w-0">
        <span className="block font-medium">{item.label}</span>
        <span className="block text-sm text-slate-600">{item.why}</span>
        {item.detail && <span className="block text-xs text-slate-500">{item.detail}</span>}
      </span>
    </li>
  );
}

export default async function AuditReportPage({ params }: PageProps<"/admin/audit/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: row } = await createAdminClient().from("audit_reports").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const findings = { ...EMPTY_FINDINGS, ...(row.findings as Partial<WebsiteFindings>) };
  const report = buildAuditReport({ industry: row.industry, findings, answers: row.answers as CallAnswers });
  const industry = getIndustry(row.industry);
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(row.created_at));
  const website = report.items.filter((i) => i.source === "website");
  const call = report.items.filter((i) => i.source === "call");
  const gradeColor = report.score >= 80 ? "text-brand-700" : report.score >= 50 ? "text-amber-600" : "text-red-700";

  return (
    <article className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/admin/audit" className="text-sm font-medium text-brand-700">← All audits</Link>
        <PrintButton />
      </div>

      <header className="card">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME} · AI-readiness check</p>
        <h1 className="mt-1 text-2xl font-bold">{row.prospect_name}</h1>
        <p className="text-sm text-slate-600">
          {report.industryLabel}
          {row.website_url ? ` · ${row.website_url}` : ""} · {date}
        </p>
        <div className="mt-4 flex items-end gap-4">
          <p className={`text-6xl font-bold ${gradeColor}`}>{report.score}</p>
          <div className="pb-2">
            <p className={`text-lg font-semibold ${gradeColor}`}>{report.grade}</p>
            <p className="text-sm text-slate-600">out of 100: how easily customers and AI assistants can find, trust, reach and book you</p>
          </div>
        </div>
        {row.fetch_error && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Website check: {row.fetch_error}</p>}
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold">Why this matters now</h2>
        <p className="mt-1 text-sm text-slate-700">
          More customers ask ChatGPT, Google, Siri or Claude things like &quot;who&apos;s the best {industry?.label.toLowerCase() ?? "local pro"} in
          Summerville that can come this week?&quot; Assistants recommend businesses whose details they can read, trust and act on,
          and that answer when called or texted.
        </p>
      </section>

      {report.topFixes.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">What we&apos;d fix first</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">
            {report.topFixes.map((i) => (
              <li key={i.key}>
                <span className="font-medium">{i.label}</span>
                {i.fixedBy && <span className="block text-sm text-brand-800">How we fix it: {i.fixedBy}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold">Website and online presence</h2>
        <ul className="divide-y divide-slate-100">{website.map((i) => <ItemRow key={i.key} item={i} />)}</ul>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Phones, texts and follow-up</h2>
        <ul className="divide-y divide-slate-100">{call.map((i) => <ItemRow key={i.key} item={i} />)}</ul>
      </section>

      {industry && (
        <section className="card break-inside-avoid">
          <h2 className="text-lg font-semibold">Licenses and insurance customers look for</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
            {industry.credentials.map((c) => (
              <li key={c.label}>
                {c.label}
                {c.requiredInSC ? <strong> (required in SC)</strong> : ""}
                {c.note && <span className="block text-slate-500">{c.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Requirements change; confirm with the licensing agency.</p>
        </section>
      )}

      <section className="card print:hidden">
        <h2 className="mb-2 text-lg font-semibold">Update answers (only you see this)</h2>
        <AnswersForm id={row.id} items={call.map((i) => ({ key: i.key, label: i.label, status: i.status }))} notes={row.notes ?? ""} />
      </section>
    </article>
  );
}
