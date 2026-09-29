import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  return (
    <header className="mb-4">
      {backHref && (
        <Link href={backHref} className="mb-2 inline-flex min-h-10 items-center text-sm font-medium text-brand-700">
          ← Back
        </Link>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
    </header>
  );
}
