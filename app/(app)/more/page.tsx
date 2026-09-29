import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon } from "@/components/nav-icon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { buildNavigation } from "@/lib/navigation";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const { org, plan } = await requireAppContext();
  const { more } = buildNavigation(org.business_type, plan);

  return (
    <>
      <PageHeader title="More" />
      <ul className="card divide-y divide-slate-100 p-0">
        {more.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 font-medium">
              <NavIcon name={item.icon} className="h-5 w-5 text-slate-500" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
