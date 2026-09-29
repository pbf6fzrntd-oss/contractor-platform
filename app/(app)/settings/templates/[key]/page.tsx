import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TEMPLATES, templateTitle } from "@/lib/templates/defaults";
import { TemplateEditor } from "./editor";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: PageProps<"/settings/templates/[key]">) {
  const { org } = await requireAppContext();
  const { key } = await params;
  const def =
    DEFAULT_TEMPLATES.find((t) => t.key === key && t.businessTypes.includes(org.business_type)) ??
    DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!def) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("message_templates")
    .select("language, body")
    .eq("org_id", org.id)
    .eq("key", key);
  const current = {
    en: rows?.find((r) => r.language === "en")?.body ?? def.text.en,
    es: rows?.find((r) => r.language === "es")?.body ?? def.text.es,
  };
  const { data: phone } = await supabase.from("phone_numbers").select("e164").eq("org_id", org.id).limit(1).maybeSingle();
  const base = {
    business_name: org.name,
    business_phone: phone ? formatUSPhone(phone.e164) : "(843) 555-0100",
    review_link: org.google_review_url ?? "https://g.page/r/your-review-link",
  };

  return (
    <>
      <PageHeader title={templateTitle(key, org.business_type)} backHref="/settings/templates" />
      <TemplateEditor
        templateKey={key}
        initial={current}
        defaults={def.text}
        canEdit
        samples={{
          en: { ...base, first_name: "Mike", service_day: "Tuesday", new_day: "Thursday" },
          es: { ...base, first_name: "María", service_day: "martes", new_day: "jueves" },
        }}
      />
    </>
  );
}
