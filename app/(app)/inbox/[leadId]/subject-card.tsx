import { FileUpload } from "@/components/file-upload";
import { SubmitButton } from "@/components/submit-button";
import type { AppContext } from "@/lib/auth/context";
import { getIndustry } from "@/lib/industries";
import { loadSubjectsForTeam } from "@/lib/services/subjects";
import { PRIVATE_FIELDS, SUBJECT_FIELDS, SUBJECT_LABELS } from "@/lib/subjects/fields";
import { createClient } from "@/lib/supabase/server";
import { documentLabel, VACCINE_TYPES } from "@/lib/automation/expiry";
import { signedUrl } from "@/lib/files/storage";
import { deleteSubjectFile, fileTextedPhoto, uploadSubjectFile } from "./subject-actions";
import { FilePhotoForm } from "./texted-photos";
import { SubjectForm } from "./subject-form";

/**
 * The customer's property / pets / vehicles, with private notes and photos.
 * Team-only screen: private details are shown here and nowhere else.
 */
export async function SubjectCard({ ctx, leadId, contactId }: { ctx: AppContext; leadId: string; contactId: string }) {
  const kind = getIndustry(ctx.org.industry)?.subjectType ?? "property";
  const subjects = await loadSubjectsForTeam(await createClient(), ctx.org.id, contactId);
  const words = SUBJECT_LABELS[kind];
  const vaccines = kind === "pet" ? VACCINE_TYPES.map((v) => ({ value: v, label: documentLabel(v, "en") })) : null;
  // Photos the customer texted in that aren't filed under a record yet.
  const { data: loose } = await (await createClient())
    .from("files")
    .select("id, content_type, storage_path, created_at")
    .eq("org_id", ctx.org.id)
    .eq("contact_id", contactId)
    .not("message_id", "is", null)
    .is("subject_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);
  const texted = await Promise.all((loose ?? []).map(async (f) => ({ ...f, url: await signedUrl(f.storage_path) })));

  return (
    <details className="card mb-4" open={subjects.length > 0 && kind !== "property"}>
      <summary className="cursor-pointer font-semibold">
        {subjects.length ? `${words.one}${subjects.length > 1 ? "s" : ""}: ${subjects.map((s) => s.label).join(", ")}` : words.add}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {subjects.map((s) => {
          const shown = SUBJECT_FIELDS[s.kind].filter((f) => s.attributes[f.key] !== undefined && s.attributes[f.key] !== "");
          const secrets = PRIVATE_FIELDS[s.kind].filter((f) => s.private?.[f.key]);
          return (
            <section key={s.id} className="flex flex-col gap-2 border-b border-slate-100 pb-4 last:border-0">
              <h3 className="font-semibold">{s.label}</h3>
              {shown.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {shown.map((f) => {
                    const v = s.attributes[f.key];
                    const text = f.type === "boolean" ? (v ? "Yes" : "No") : f.options?.find((o) => o.value === v)?.label ?? String(v);
                    return (
                      <div key={f.key} className="contents">
                        <dt className="text-slate-500">{f.label}</dt>
                        <dd>{text}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {secrets.map((f) => (
                <p key={f.key} className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span className="block text-xs font-semibold text-amber-900">🔒 {f.label}</span>
                  <span className={f.key === "vin" ? "font-mono" : "whitespace-pre-line"}>{s.private?.[f.key]}</span>
                </p>
              ))}
              {s.files.length > 0 && (
                <ul className="grid grid-cols-3 gap-2">
                  {s.files.map((f) => (
                    <li key={f.id} className="relative">
                      {f.url && f.content_type.startsWith("image/") && f.content_type !== "image/heic" ? (
                        <>
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {/* Signed, short-lived private links: next/image can't cache them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.original_name ?? "Photo"} className="aspect-square w-full rounded-lg object-cover" />
                        </a>
                        {f.kind === "vaccination_record" && (
                          <span className="mt-0.5 block text-xs text-slate-600">💉 {documentLabel(f.document_type, "en")}{f.expires_on ? ` · exp. ${f.expires_on}` : ""}</span>
                        )}
                        </>
                      ) : (
                        <a href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 p-1 text-center text-xs">
                          📄 {f.kind === "vaccination_record" && f.document_type ? documentLabel(f.document_type, "en") : (f.original_name ?? "File")}
                          {f.expires_on ? ` · exp. ${f.expires_on}` : ""}
                        </a>
                      )}
                      <form action={deleteSubjectFile.bind(null, leadId, f.id)} className="absolute right-1 top-1">
                        <SubmitButton className="rounded-full bg-white/90 px-2 text-xs text-red-700 shadow" pendingText="…">✕</SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <FileUpload action={uploadSubjectFile.bind(null, leadId, s.id)} accept="image/*,application/pdf" label="📷 Add photo or file">
                <input type="hidden" name="kind" value="document" />
              </FileUpload>
              {vaccines && s.kind === "pet" && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand-700">💉 Add vaccine record</summary>
                  <div className="mt-2">
                    <FileUpload action={uploadSubjectFile.bind(null, leadId, s.id)} accept="image/*,application/pdf" label="Choose the record (photo or PDF)">
                      <input type="hidden" name="kind" value="vaccination_record" />
                      <div className="grid grid-cols-2 gap-2">
                        <select name="document_type" className="input" required defaultValue="">
                          <option value="" disabled>Vaccine</option>
                          {vaccines.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                        </select>
                        <input type="date" name="expires_on" className="input" required aria-label="Expires" />
                      </div>
                    </FileUpload>
                  </div>
                </details>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit details</summary>
                <div className="mt-2">
                  <SubjectForm leadId={leadId} subjectId={s.id} kind={s.kind} values={s.attributes} privateValues={s.private ?? {}} />
                </div>
              </details>
            </section>
          );
        })}
        {(subjects.length === 0 || kind !== "property") && (
          <details open={subjects.length === 0}>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">{words.add}</summary>
            <div className="mt-2">
              <SubjectForm leadId={leadId} subjectId={null} kind={kind} />
            </div>
          </details>
        )}
        {texted.length > 0 && subjects.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Texted in, not filed yet</h3>
            <ul className="grid grid-cols-2 gap-3">
              {texted.map((f) => (
                <li key={f.id}>
                  {f.url && f.content_type.startsWith("image/") && f.content_type !== "image/heic" ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="Texted-in photo" className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                  ) : (
                    <a href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-sm">📄 Open</a>
                  )}
                  <FilePhotoForm action={fileTextedPhoto.bind(null, leadId, f.id)} subjects={subjects.map((s) => ({ value: s.id, label: s.label }))} vaccines={vaccines} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-xs text-slate-500">Photos and 🔒 notes are private to your team. They&apos;re never texted, shared with AI assistants or shown publicly.</p>
      </div>
    </details>
  );
}
