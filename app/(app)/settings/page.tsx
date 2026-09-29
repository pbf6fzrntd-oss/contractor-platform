import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { BUSINESS_TYPE_INFO } from "@/lib/business-types";

export const metadata: Metadata = { title: "Settings" };

type Row = { href?: string; label: string; detail: string };

export default async function SettingsPage() {
  const { org, role, plan } = await requireAppContext();

  const rows: Row[] = [
    { href: "/settings/business", label: "Business details", detail: BUSINESS_TYPE_INFO[org.business_type].label },
    { href: "/settings/team", label: "Team", detail: role === "owner" ? "Invite office managers" : "See your team" },
    { href: "/settings/templates", label: "Message templates", detail: "English and Spanish" },
    { label: "Phone number", detail: "Coming in Milestone 1" },
    { label: "Automations", detail: "Coming in Milestone 3" },
    { label: "Billing", detail: `${plan.id === "pilot" ? "Pilot" : plan.id} plan` },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle={`${org.name} · ${role === "owner" ? "Owner" : "Office manager"}`} />
      <ul className="card divide-y divide-slate-100 p-0">
        {rows.map((row) => {
          const inner = (
            <>
              <span className="font-medium">{row.label}</span>
              <span className="text-sm text-slate-500">{row.detail}</span>
            </>
          );
          return (
            <li key={row.label}>
              {row.href ? (
                <Link href={row.href} className="flex min-h-14 flex-col justify-center px-4 py-2">
                  {inner}
                </Link>
              ) : (
                <div className="flex min-h-14 flex-col justify-center px-4 py-2 opacity-60">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <form action="/auth/signout" method="post" className="mt-6">
        <button type="submit" className="btn-secondary w-full">
          Log out
        </button>
      </form>
    </>
  );
}
