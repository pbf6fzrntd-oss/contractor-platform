/** Run only against a dedicated hosted demo database. Never prints credentials. */
import { validateDemoDeployment } from "@/lib/deployment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDemoBusiness } from "@/lib/services/demo";

async function main() {
  if (process.env.DEPLOYMENT_MODE !== "demo") throw new Error("Operator seeding requires DEPLOYMENT_MODE=demo");
  const errors = validateDemoDeployment(process.env);
  if (errors.length) throw new Error(errors.join("; "));
  const email = process.env.DEMO_OPERATOR_EMAIL?.trim();
  const password = process.env.DEMO_OPERATOR_PASSWORD;
  if (!email?.includes("@") || !password || password.length < 16) throw new Error("Set an operator email and password of at least 16 characters");
  const db = createAdminClient();
  const check = await db.from("organizations").select("id", { head: true, count: "exact" }).eq("is_demo", false);
  if (check.error || check.count !== 0) throw new Error("Refusing to seed a database containing ordinary organizations or unavailable schema");
  const login = await createDemoBusiness(db, "lawn_care");
  let userId: string | undefined;
  try {
    const member = await db.from("memberships").select("user_id").eq("org_id", login.orgId).single();
    if (member.error || !member.data) throw new Error("Unable to identify the new demo owner");
    userId = member.data.user_id;
    const update = await db.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
    if (update.error) throw new Error("Unable to set operator credentials; the email may already exist");
    const permanent = await db.from("organizations").update({ demo_expires_at: null }).eq("id", login.orgId).eq("is_demo", true);
    if (permanent.error) throw new Error("Unable to make the operator workspace persistent");
    console.log("Persistent fictional operator workspace created. Sign in with your configured credentials.");
  } catch (error) {
    const cleanup = await db.from("organizations").delete().eq("id", login.orgId).eq("is_demo", true);
    if (userId) await db.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error("Cleanup incomplete; remove the newly created demo organization before retrying.");
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Operator setup failed");
  process.exitCode = 1;
});
