import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { accessFromScope, ACCESS_DESCRIPTION, ACCESS_LABEL, canConnectAi, capAccess, levelsForRole } from "@/lib/agent/oauth";
import { getAppContext, getUserId } from "@/lib/auth/context";
import { APP_NAME } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveConnection, denyConnection } from "./actions";

export const metadata: Metadata = { title: "Connect an AI assistant" };

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME}</p>
      <h1 className="mb-2 text-2xl font-bold">Can&apos;t connect</h1>
      <p className="text-slate-600">{children}</p>
    </main>
  );
}

/** The owner's "Allow" screen when an AI app (Claude, ChatGPT, ...) asks to connect. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  if (!(await getUserId())) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const req = {
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    code_challenge: get("code_challenge"),
    state: get("state"),
  };
  if (get("response_type") !== "code" || get("code_challenge_method") !== "S256" || !req.code_challenge) {
    return <Problem>The app&apos;s request is incomplete (it must use a secure sign-in with PKCE). Try connecting again from the app.</Problem>;
  }
  const { data: client } = /^[0-9a-f-]{36}$/.test(req.client_id)
    ? await createAdminClient().from("oauth_clients").select("client_name, redirect_uris").eq("id", req.client_id).maybeSingle()
    : { data: null };
  if (!client || !client.redirect_uris.includes(req.redirect_uri)) {
    return <Problem>This app isn&apos;t recognized. Try connecting again from the app.</Problem>;
  }

  const ctx = await getAppContext();
  if (!ctx) redirect("/onboarding");
  if (!canConnectAi(ctx.role, ctx.plan)) {
    return (
      <Problem>
        Office managers can connect their own AI tools on the Executive plan. Ask {ctx.org.name}&apos;s owner about upgrading, or to
        connect it for you.
      </Problem>
    );
  }
  const levels = levelsForRole(ctx.role);
  const requested = capAccess(accessFromScope(get("scope")), ctx.role);
  const returnHost = new URL(req.redirect_uri).host;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME}</p>
      <h1 className="text-2xl font-bold">Connect {client.client_name}?</h1>
      <p className="mb-5 mt-1 text-slate-600">
        <strong>{client.client_name}</strong> wants to work with <strong>{ctx.org.name}</strong> for you. It follows the same
        texting rules as the app, and everything it does is listed in Settings → AI assistants.
      </p>

      <form action={approveConnection.bind(null, req)} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="label">What can it do?</legend>
          {levels.map((level) => (
            <label key={level} className="card flex cursor-pointer items-start gap-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="access" value={level} defaultChecked={level === requested} className="mt-1 h-5 w-5 accent-brand-600" />
              <span>
                <span className="block font-semibold">{ACCESS_LABEL[level]}</span>
                <span className="block text-sm text-slate-600">{ACCESS_DESCRIPTION[level]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-slate-500">
          {ctx.role === "owner"
            ? "Team, billing and carrier registration always stay with you."
            : "As an office manager, your assistant can do day-to-day work; campaigns, wording and settings stay with the owner."} You&apos;ll return to {returnHost}. You can disconnect any
          time.
        </p>
        <SubmitButton pendingText="Connecting…">Allow</SubmitButton>
      </form>
      <form action={denyConnection.bind(null, req)} className="mt-3">
        <SubmitButton className="btn-secondary w-full" pendingText="…">Don&apos;t allow</SubmitButton>
      </form>
    </main>
  );
}
