import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** A customer's private booking link: no app menus, no login. */
export default function ManageBookingLayout({ children }: LayoutProps<"/m">) {
  return (
    <main className="mx-auto max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      {children}
      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Powered by {APP_NAME} · <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/sms-terms" className="underline">Text message terms</Link>
      </footer>
    </main>
  );
}
