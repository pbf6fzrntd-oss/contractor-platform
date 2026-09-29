import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { LANGUAGE_LABELS, type Language } from "@/lib/business-types";
import { formatUSPhone } from "@/lib/phone";
import { MESSAGE_CATEGORIES, templateTitle, type MessageCategory } from "@/lib/templates/defaults";
import { renderTemplate } from "@/lib/templates/render";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Message templates" };

const CATEGORY_INFO: Record<MessageCategory, { title: string; description: string }> = {
  conversational: {
    title: "Replies",
    description: "Sent to people who just called or texted you.",
  },
  informational: {
    title: "Updates",
    description: "About an estimate, job or service the customer already has.",
  },
  marketing: {
    title: "Promotions",
    description: "Only sent to customers who agreed to receive offers.",
  },
};

export default async function TemplatesPage({ searchParams }: PageProps<"/settings/templates">) {
  const { org } = await requireAppContext();
  const { lang } = await searchParams;
  const language: Language = lang === "es" ? "es" : lang === "en" ? "en" : org.default_language;

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("message_templates")
    .select("id, key, category, body")
    .eq("org_id", org.id)
    .eq("language", language)
    .order("key");

  // Sample values so owners can see what customers will actually receive.
  const sample = {
    business_name: org.name,
    business_phone: org.alert_phone ? formatUSPhone(org.alert_phone) : "(843) 555-0100",
    first_name: language === "es" ? "María" : "Mike",
    review_link: org.google_review_url ?? "https://g.page/r/your-review-link",
    service_day: language === "es" ? "martes" : "Tuesday",
    new_day: language === "es" ? "jueves" : "Thursday",
  };

  return (
    <>
      <PageHeader
        title="Message templates"
        subtitle="Tap a message to edit it. Previews use your business name and a sample customer."
        backHref="/settings"
      />

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-200 p-1" role="tablist">
        {(["en", "es"] as const).map((l) => (
          <a
            key={l}
            href={`?lang=${l}`}
            role="tab"
            aria-selected={l === language}
            className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold ${
              l === language ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            {LANGUAGE_LABELS[l]}
          </a>
        ))}
      </div>

      {MESSAGE_CATEGORIES.map((category) => {
        const rows = (templates ?? []).filter((t) => t.category === category);
        if (rows.length === 0) return null;
        return (
          <section key={category} className="mb-6">
            <h2 className="text-lg font-semibold">{CATEGORY_INFO[category].title}</h2>
            <p className="mb-2 text-sm text-slate-600">{CATEGORY_INFO[category].description}</p>
            <ul className="flex flex-col gap-3">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link href={`/settings/templates/${t.key}`} className="card block">
                    <p className="mb-2 flex justify-between text-sm font-semibold text-slate-700">
                      {templateTitle(t.key, org.business_type)}
                      <span className="font-medium text-brand-700">Edit</span>
                    </p>
                    <p className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[15px] leading-snug">
                      {renderTemplate(t.body, sample)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
