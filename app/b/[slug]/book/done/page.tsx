import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicLang, words } from "@/lib/public/i18n";
import { getPublicBusiness } from "../../data";

export const metadata: Metadata = { title: "Booking received", robots: { index: false } };

export default async function BookingDonePage({ params, searchParams }: PageProps<"/b/[slug]/book/done">) {
  const { slug } = await params;
  const sp = await searchParams;
  const biz = await getPublicBusiness(slug);
  if (!biz) notFound();
  const waiting = sp.status === "pending_approval" || sp.status === "requested";
  const lang = publicLang(sp.lang);
  const t = words(lang);
  const when = typeof sp.when === "string" ? sp.when.slice(0, 80) : "";
  return (
    <section className="card flex flex-col gap-3 text-center">
      <p className="text-4xl">{waiting ? "📨" : "✅"}</p>
      <h1 className="text-2xl font-bold">{waiting ? t.requestSent : t.booked}</h1>
      <p className="text-slate-700">
        {waiting ? t.willConfirm(biz.profile.name, when) : `${biz.profile.name}: ${when}.`}
        {sp.texted === "1" ? ` ${t.textedDetails}` : ""}
      </p>
      {typeof sp.ref === "string" && <p className="text-sm text-slate-500">{t.reference} {sp.ref.slice(0, 12)}</p>}
      <Link href={`/b/${slug}${lang === "es" ? "?lang=es" : ""}`} className="btn-secondary">{t.back} {biz.profile.name}</Link>
    </section>
  );
}
