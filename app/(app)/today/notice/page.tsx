import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { SERVICE_NOTICE_EARLY_WARNING_HOUR, SERVICE_NOTICE_WINDOW } from "@/lib/automation/compliance";
import { previewNotice } from "@/lib/services/broadcasts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateString, zonedParts } from "@/lib/time";
import { NoticeForm } from "./notice-form";

export const metadata: Metadata = { title: "Text customers" };

const TITLES = { rain_delay: "Rain delay", running_late: "Running late", custom: "Message today's customers" };

export default async function NoticePage({ searchParams }: PageProps<"/today/notice">) {
  const { org } = await requireAppContext("/today");
  const params = await searchParams;
  const type = params.type === "running_late" || params.type === "custom" ? params.type : "rain_delay";
  const today = localDateString(new Date(), org.timezone);
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const selection = await previewNotice(createAdminClient(), org.id, date);
  const supabase = await createClient();
  const { data: rows } = type === "custom"
    ? { data: [] }
    : await supabase.from("message_templates").select("language, body").eq("org_id", org.id).eq("key", type);
  const templates = {
    en: rows?.find((r) => r.language === "en")?.body ?? "",
    es: rows?.find((r) => r.language === "es")?.body ?? "",
  };
  const hour = zonedParts(new Date(), org.timezone).hour;

  return (
    <>
      <PageHeader title={TITLES[type]} subtitle={`${selection.recipients.length} customers scheduled`} backHref={`/today?date=${date}`} />
      {hour < SERVICE_NOTICE_WINDOW.start || hour >= SERVICE_NOTICE_WINDOW.end ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          It&apos;s too early or late to text customers right now. If you send, texts go out at 6am.
        </p>
      ) : null}
      {selection.recipients.length === 0 ? (
        <p className="card text-center text-slate-600">Nobody who can receive texts is scheduled for this day.</p>
      ) : (
        <NoticeForm
          type={type}
          date={date}
          dayOptions={[1, 2, 3, 4, 5, 6].map((n) => addDays(date, n))}
          templates={templates}
          businessName={org.name}
          recipients={selection.recipients.length}
          spanishRecipients={selection.recipients.filter((r) => r.language === "es").length}
          optedOut={selection.excluded.opted_out}
          earlyWarning={hour >= SERVICE_NOTICE_WINDOW.start && hour < SERVICE_NOTICE_EARLY_WARNING_HOUR}
        />
      )}
    </>
  );
}
