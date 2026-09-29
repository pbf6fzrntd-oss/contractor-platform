import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { ACCESS_LABEL, isAccessLevel } from "@/lib/agent/oauth";
import { requireOwner } from "@/lib/auth/context";
import { publicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";
import { revokeAssistantKey } from "./actions";
import { CreateKeyForm } from "./create-key";

export const metadata: Metadata = { title: "AI assistants" };

export default async function AssistantsPage() {
  const { org } = await requireOwner();
  const supabase = await createClient();
  const [{ data: keys }, { data: activity }] = await Promise.all([
    supabase.from("api_keys").select("id, name, key_prefix, access, source, created_at, last_used_at, revoked_at, refresh_expires_at").eq("org_id", org.id).order("created_at", { ascending: false }),
    supabase.from("agent_activity").select("id, tool, summary, ok, created_at, api_key_id").eq("org_id", org.id).order("created_at", { ascending: false }).limit(25),
  ]);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: org.timezone });
  const now = new Date().getTime();
  // Connected apps stay listed while they can still refresh; typed keys until revoked.
  const active = (keys ?? []).filter(
    (k) => !k.revoked_at && (k.source !== "oauth" || (k.refresh_expires_at && Date.parse(k.refresh_expires_at) > now)),
  );
  const keyName = new Map((keys ?? []).map((k) => [k.id, k.name]));

  return (
    <>
      <PageHeader
        title="AI assistants"
        subtitle="Let an AI assistant like Claude or ChatGPT run your inbox, customers and texts for you, using the same texting rules as the app. Team, billing and carrier registration stay with you."
        backHref="/settings"
      />

      <section className="card mb-4 flex flex-col gap-2">
        <h2 className="font-semibold">Easiest: connect from your AI app</h2>
        <p className="text-sm text-slate-700">
          In Claude or ChatGPT, add a connector (sometimes called a custom connector or MCP server) with this address. You&apos;ll
          be sent here to log in and tap <strong>Allow</strong>. No key to copy.
        </p>
        <p className="select-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm">{`${publicEnv.siteUrl}/api/mcp`}</p>
      </section>

      <h2 className="mb-2 text-lg font-semibold">Or create a key</h2>
      <p className="mb-3 text-sm text-slate-600">For AI apps that ask for a key instead.</p>
      <CreateKeyForm endpoint={`${publicEnv.siteUrl}/api/mcp`} />

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Your keys</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-600">No keys yet.</p>
        ) : (
          <ul className="card divide-y divide-slate-100 p-0">
            {active.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{k.name}</span>
                  <span className="block text-sm text-slate-600">
                    {ACCESS_LABEL[isAccessLevel(k.access) ? k.access : "read"]} ·{" "}
                    {k.source === "oauth" ? "Connected app" : <span className="font-mono">{k.key_prefix}…</span>}
                  </span>
                  <span className="block text-xs text-slate-500">{k.last_used_at ? `Last used ${fmt.format(new Date(k.last_used_at))}` : "Not used yet"}</span>
                </span>
                <form action={revokeAssistantKey.bind(null, k.id)}>
                  <SubmitButton className="btn-danger min-h-10 px-3 text-sm" pendingText="…">
                    {k.source === "oauth" ? "Disconnect" : "Revoke"}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">What assistants did</h2>
        {(activity ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">Nothing yet. Every lookup and action will be listed here.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {(activity ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className={a.ok ? "" : "text-red-700"}>{a.summary}</span>
                <span className="shrink-0 text-right text-xs text-slate-500">
                  {fmt.format(new Date(a.created_at))}
                  <span className="block">{a.api_key_id ? keyName.get(a.api_key_id) : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-sm text-slate-600">
        Keep keys private, like a password. If one might be exposed, revoke it and make a new one. Texts an assistant sends show
        &quot;via AI assistant&quot; in the conversation. Opted-out customers are never texted.
      </p>
    </>
  );
}
