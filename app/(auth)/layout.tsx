import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/" className="mb-8 text-sm font-semibold uppercase tracking-wide text-brand-700">
        {APP_NAME}
      </Link>
      {children}
    </main>
  );
}
