import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CREDENTIAL_KIND_LABEL, type CredentialKind } from "@/lib/credentials";
import { getIndustry } from "@/lib/industries";
import { formatUSPhone } from "@/lib/phone";
import { priceText, toJsonLd } from "@/lib/public/profile";
import { getPublicBusiness, publicUrls } from "./data";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
export default async function PublicProfilePage({ params }: PageProps<"/b/[slug]">) {
  const biz = await getPublicBusiness((await params).slug);
  if (!biz) notFound();
  const p = biz.profile;
  const urls = publicUrls(p.slug, p.booking_available);
  const industry = getIndustry(p.industry);
  const jsonLd = toJsonLd(p, urls.page, urls.booking);

  return (
    <>
      {/* Structured data for search engines and AI assistants. "<" is escaped so text can't break out of the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{industry?.label ?? "Local business"}</p>
        <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        {p.service_area && <p className="mt-1 text-slate-600">Serving {p.service_area}</p>}
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {p.phone && <a href={`tel:${p.phone}`} className="btn-secondary">📞 Call</a>}
        {p.phone && <a href={`sms:${p.phone}`} className="btn-secondary">💬 Text</a>}
        {urls.booking && <Link href={urls.booking.replace(/^https?:\/\/[^/]+/, "")} className="btn-primary col-span-2">Book online</Link>}
      </div>

      {p.about && <p className="card mb-4 whitespace-pre-line text-slate-700">{p.about}</p>}

      {p.services.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-lg font-semibold">Services</h2>
          <ul className="divide-y divide-slate-100">
            {p.services.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span>{s.name}</span>
                {priceText(s) && <span className="shrink-0 text-slate-600">{priceText(s)}</span>}
              </li>
            ))}
          </ul>
          {p.services.some((s) => priceText(s)) && <p className="mt-2 text-xs text-slate-500">Typical prices. The business confirms your exact price.</p>}
        </section>
      )}

      {p.hours && (
        <section className="card mb-4">
          <h2 className="mb-1 text-lg font-semibold">Hours</h2>
          <p className="text-slate-700">
            {p.hours.open_days.map((d) => DAYS[d]).join(", ")} · {hour(p.hours.open_hour)}–{hour(p.hours.close_hour)}
          </p>
        </section>
      )}

      {p.credentials.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-lg font-semibold">Licensed & insured</h2>
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
          ⭐ Read our Google reviews
        </a>
      )}
      {p.phone && <p className="mt-4 text-center text-sm text-slate-600">{formatUSPhone(p.phone)}</p>}
    </>
  );
}
