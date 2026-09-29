import type { Metadata } from "next";
import Link from "next/link";
import { getUserId } from "@/lib/auth/context";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Join your team" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const here = `/invite/${token}`;

  let content: React.ReactNode;
  if (!(await getUserId())) {
    content = (
      <>
        <p className="mb-6 text-slate-600">You&apos;ve been invited to join a team. Create an account or log in first.</p>
        <div className="flex flex-col gap-3">
          <Link href={`/signup?next=${encodeURIComponent(here)}`} className="btn-primary">
            Create account
          </Link>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn-secondary">
            I already have an account
          </Link>
        </div>
      </>
    );
  } else {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_invitation", { p_token: token });
    const invite = data?.[0];
    content =
      invite?.is_valid ? (
        <>
          <p className="mb-6 text-slate-600">
            You&apos;ve been invited to join <strong>{invite.org_name}</strong> as an office manager.
          </p>
          <AcceptInviteForm token={token} orgName={invite.org_name} />
        </>
      ) : (
        <p className="text-slate-600">
          This invite link is invalid or has expired. Ask the business owner to send you a new one.
        </p>
      );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <p className="mb-8 text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME}</p>
      <h1 className="mb-2 text-2xl font-bold">Join your team</h1>
      {content}
    </main>
  );
}
