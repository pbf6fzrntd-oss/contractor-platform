import { FileUpload } from "@/components/file-upload";
import { SubmitButton } from "@/components/submit-button";
import type { AppContext } from "@/lib/auth/context";
import { getIndustry } from "@/lib/industries";
import { loadSubjectsForTeam } from "@/lib/services/subjects";
import { PRIVATE_FIELDS, SUBJECT_FIELDS, SUBJECT_LABELS } from "@/lib/subjects/fields";
import { createClient } from "@/lib/supabase/server";
import { deleteSubjectFile, uploadSubjectFile } from "./subject-actions";
import { SubjectForm } from "./subject-form";

/**
 * The customer's property / pets / vehicles, with private notes and photos.
 * Team-only screen: private details are shown here and nowhere else.
 */
export async function SubjectCard({ ctx, leadId, contactId }: { ctx: AppContext; leadId: string; contactId: string }) {
  const kind = getIndustry(ctx.org.industry)?.subjectType ?? "property";
  const subjects = await loadSubjectsForTeam(await createClient(), ctx.org.id, contactId);
  const words = SUBJECT_LABELS[kind];

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
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {/* Signed, short-lived private links: next/image can't cache them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.original_name ?? "Photo"} className="aspect-square w-full rounded-lg object-cover" />
                        </a>
                      ) : (
                        <a href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 p-1 text-center text-xs">
                          📄 {f.original_name ?? "File"}
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
        <p className="text-xs text-slate-500">Photos and 🔒 notes are private to your team. They&apos;re never texted, shared with AI assistants or shown publicly.</p>
      </div>
    </details>
  );
}
