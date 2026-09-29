import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { canAddUser } from "@/lib/entitlements";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createInvite, deleteInvite, removeMember } from "./actions";
import { InviteLink } from "./invite-link";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { org, role, plan, userId } = await requireAppContext();
  const isOwner = role === "owner";
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", org.id)
    .order("created_at");
  const memberList = members ?? [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      memberList.map((m) => m.user_id),
    );
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: invites } = isOwner
    ? await supabase
        .from("invitations")
        .select("id, token, expires_at")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };

  const roomForMore = canAddUser(plan, memberList.length);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`${memberList.length} of ${plan.max_users} logins used on your plan.`}
        backHref="/settings"
      />

      <ul className="card mb-6 divide-y divide-slate-100 p-0">
        {memberList.map((m) => {
          const profile = profileById.get(m.user_id);
          return (
            <li key={m.user_id} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {profile?.full_name ?? profile?.email ?? "Team member"}
                  {m.user_id === userId && <span className="font-normal text-slate-500"> (you)</span>}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {m.role === "owner" ? "Owner" : "Office manager"} · {profile?.email}
                </p>
              </div>
              {isOwner && m.user_id !== userId && (
                <form action={removeMember.bind(null, m.user_id)}>
                  <SubmitButton className="btn-danger min-h-10 px-3 text-sm" pendingText="Removing…">
                    Remove
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Invite an office manager</h2>
          <p className="mb-3 text-sm text-slate-600">
            Office managers can use the inbox and templates, but can&apos;t change business settings or the team.
            Links work once and expire after 7 days.
          </p>

          <div className="flex flex-col gap-4">
            {(invites ?? []).map((invite) => (
              <div key={invite.id} className="card flex flex-col gap-3">
                <InviteLink url={`${publicEnv.siteUrl}/invite/${invite.token}`} />
                <form action={deleteInvite.bind(null, invite.id)}>
                  <SubmitButton className="text-sm font-medium text-red-700" pendingText="Canceling…">
                    Cancel this invite
                  </SubmitButton>
                </form>
              </div>
            ))}

            {roomForMore ? (
              <form action={createInvite}>
                <SubmitButton className="btn-primary w-full" pendingText="Creating…">
                  Create invite link
                </SubmitButton>
              </form>
            ) : (
              <p className="card text-sm text-slate-600">
                You&apos;ve used all the logins on your plan. Remove someone to invite a new person.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
