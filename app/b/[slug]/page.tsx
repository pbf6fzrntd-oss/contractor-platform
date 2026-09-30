import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CREDENTIAL_KIND_LABEL, type CredentialKind } from "@/lib/credentials";
import { getIndustry } from "@/lib/industries";
import { formatUSPhone } from "@/lib/phone";
import { DAY_ABBR, publicLang, words } from "@/lib/public/i18n";
import { priceText, toJsonLd } from "@/lib/public/profile";
import { getPublicBusiness, publicUrls } from "./data";

const hour = (h: number) => (h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const biz = await getPublicBusiness((await params).slug);
  if (!biz) return { title: "Not found", robots: { index: false } };
  const industry = getIndustry(biz.profile.industry);
  return {
    title: { absolute: `${biz.profile.name}${industry ? ` · ${industry.label}` : ""}` },
    description: biz.profile.about ?? `${biz.profile.name}${biz.profile.service_area ? ` serving ${biz.profile.service_area}` : ""}.`,
    alternates: { canonical: publicUrls(biz.profile.slug, false).page },
  };
}

/** The business's public profile: what customers and AI assistants read. */
export default async function PublicProfilePage({ params, searchParams }: PageProps<"/b/[slug]">) {
  const biz = await getPublicBusiness((await params).slug);
  const lang = publicLang((await searchParams).lang);
  const t = words(lang);
  if (!biz) notFound();
  const p = biz.profile;
  const urls = publicUrls(p.slug, p.booking_available);
  const industry = getIndustry(p.industry);
  const jsonLd = toJsonLd(p, urls.page, urls.booking);

  return (
    <>
      {/* Structured data for search engines and AI assistants. "<" is escaped so text can't break out of the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mb-2 flex justify-end">
        <Link href={`/b/${biz.profile.slug}${lang === "es" ? "" : "?lang=es"}`} className="inline-flex min-h-10 items-center text-sm font-medium text-brand-700" hrefLang={lang === "es" ? "en" : "es"}>{t.switchTo}</Link>
      </div>
      <header className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{industry?.label ?? "Local business"}</p>
        <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        {p.service_area && <p className="mt-1 text-slate-600">{t.serving} {p.service_area}</p>}
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {p.phone && <a href={`tel:${p.phone}`} className="btn-secondary">{t.call}</a>}
        {p.phone && <a href={`sms:${p.phone}`} className="btn-secondary">{t.text}</a>}
        {urls.booking && <Link href={`${urls.booking.replace(/^https?:\/\/[^/]+/, "")}${lang === "es" ? "?lang=es" : ""}`} className="btn-primary col-span-2">{t.bookOnline}</Link>}
      </div>

      {p.about && <p className="card mb-4 whitespace-pre-line text-slate-700">{p.about}</p>}

      {p.services.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-lg font-semibold">{t.services}</h2>
          <ul className="divide-y divide-slate-100">
            {p.services.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span>{lang === "es" && s.name_es ? s.name_es : s.name}</span>
                {priceText(s) && <span className="shrink-0 text-slate-600">{priceText(s)}</span>}
              </li>
            ))}
          </ul>
          {p.services.some((s) => priceText(s)) && <p className="mt-2 text-xs text-slate-500">{t.typicalPrices}</p>}
        </section>
      )}

      {p.hours && (
        <section className="card mb-4">
          <h2 className="mb-1 text-lg font-semibold">{t.hours}</h2>
          <p className="text-slate-700">
            {p.hours.open_days.map((d) => DAY_ABBR[lang][d]).join(", ")} · {hour(p.hours.open_hour)}–{hour(p.hours.close_hour)}
          </p>
        </section>
      )}

      {p.credentials.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-lg font-semibold">{t.licensed}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {p.credentials.map((c) => (
              <li key={c.label}>
                ✓ {c.label}
                <span className="text-slate-500">
                  {" "}
                  ({CREDENTIAL_KIND_LABEL[c.kind as CredentialKind] ?? c.kind}
                  {c.number ? ` #${c.number}` : ""}
                  {c.issuer ? `, ${c.issuer}` : ""})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.review_url && (
        <a href={p.review_url} className="btn-secondary w-full" rel="noopener">
          {t.reviews}
        </a>
      )}
      {p.phone && <p className="mt-4 text-center text-sm text-slate-600">{formatUSPhone(p.phone)}</p>}
    </>
  );
}
