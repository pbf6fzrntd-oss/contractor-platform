import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePlatformAdmin();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <nav className="mb-4 flex gap-4 text-sm font-medium print:hidden">
        <Link href="/admin" className="text-brand-700">Businesses</Link>
        <Link href="/admin/plans" className="text-brand-700">Plans & prices</Link>
        <Link href="/admin/delivery" className="text-brand-700">Delivery review</Link>
        <Link href="/admin/audit" className="text-brand-700">Sales audits</Link>
        <Link href="/home" className="ml-auto text-slate-500">Back to app</Link>
      </nav>
      {children}
    </main>
  );
}
