import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/" className="mb-6 inline-block text-sm font-semibold uppercase tracking-wide text-brand-700">
        {APP_NAME}
      </Link>
      <article className="prose-legal flex flex-col gap-4 text-slate-800 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
      <nav className="mt-10 flex gap-4 text-sm">
        <Link href="/privacy" className="link">Privacy</Link>
        <Link href="/terms" className="link">Terms</Link>
        <Link href="/sms-terms" className="link">SMS terms</Link>
      </nav>
    </main>
  );
}
