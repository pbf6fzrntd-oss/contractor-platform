/**
 * Data isolation tests: proves one business can never see or change another
 * business's data, and that office managers can't do owner-only things.
 *
 * Runs against a real database set in TEST_DATABASE_URL (your *dev* Supabase
 * project's connection string, or a local Postgres prepared with
 * `npm run db:test:setup`). Everything happens inside a transaction that is
 * rolled back at the end, so it leaves no data behind.
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("row-level security", () => {
  const db = new Client({ connectionString: url });
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const managerA = randomUUID();
  let orgA = "";
  let orgB = "";

  /** Run the next queries as a logged-in user (like the app does). */
  async function actAs(userId: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.query("set local role authenticated");
  }

  async function actAsAnonymous() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
    await db.query("set local role anon");
  }

  /** Run a query inside a savepoint so an expected error doesn't end the test. */
  async function attempt(sql: string, params: unknown[] = []) {
    await db.query("savepoint attempt");
    try {
      const result = await db.query(sql, params);
      await db.query("release savepoint attempt");
      return { rowCount: result.rowCount ?? 0, rows: result.rows, error: null };
    } catch (error) {
      await db.query("rollback to savepoint attempt");
      return { rowCount: 0, rows: [], error: error as Error };
    }
  }

  const templates = JSON.stringify([
    { key: "missed_call_reply", language: "en", category: "conversational", body: "Hi" },
  ]);

  beforeAll(async () => {
    await db.connect();
    await db.query("begin");
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'a@example.com', '{"full_name":"Owner A"}'),
        ($2, 'b@example.com', '{"full_name":"Owner B"}'),
        ($3, 'm@example.com', '{"full_name":"Manager A"}')`,
      [ownerA, ownerB, managerA],
    );

    await actAs(ownerA);
    orgA = (
      await db.query(
        "select public.create_organization('A Roofing', 'project', 'en', $1::jsonb) as id",
        [templates],
      )
    ).rows[0].id;

    await actAs(ownerB);
    orgB = (
      await db.query(
        "select public.create_organization('B Lawn', 'recurring', 'es', $1::jsonb) as id",
        [templates],
      )
    ).rows[0].id;

    // Owner A invites a manager, who accepts.
    await actAs(ownerA);
    const token = (
      await db.query("insert into public.invitations (org_id) values ($1) returning token", [orgA])
    ).rows[0].token;
    await actAs(managerA);
    await db.query("select public.accept_invitation($1)", [token]);
  });

  afterAll(async () => {
    await db.query("rollback");
    await db.end();
  });

  it("creates the business, owner membership and templates together", async () => {
    await actAs(ownerA);
    const members = await db.query("select role from public.memberships where user_id = $1", [ownerA]);
    expect(members.rows).toEqual([{ role: "owner" }]);
    const tpl = await db.query("select count(*)::int as n from public.message_templates where org_id = $1", [orgA]);
    expect(tpl.rows[0].n).toBe(1);
  });

  it("each owner sees only their own business", async () => {
    await actAs(ownerA);
    const a = await db.query("select id from public.organizations");
    expect(a.rows.map((r) => r.id)).toEqual([orgA]);

    await actAs(ownerB);
    const b = await db.query("select id from public.organizations");
    expect(b.rows.map((r) => r.id)).toEqual([orgB]);
  });

  it("hides another business's templates, team and subscription", async () => {
    await actAs(ownerA);
    for (const table of ["message_templates", "memberships", "subscriptions", "invitations"]) {
      const res = await db.query(`select * from public.${table} where org_id = $1`, [orgB]);
      expect(res.rowCount, table).toBe(0);
    }
  });

  it("blocks changing another business's data", async () => {
    await actAs(ownerA);
    const upd = await attempt("update public.organizations set name = 'hacked' where id = $1", [orgB]);
    expect(upd.rowCount).toBe(0);
    const tplUpd = await attempt("update public.message_templates set body = 'hacked' where org_id = $1", [orgB]);
    expect(tplUpd.rowCount).toBe(0);
    const tplIns = await attempt(
      "insert into public.message_templates (org_id, key, language, category, body) values ($1, 'x', 'en', 'marketing', 'x')",
      [orgB],
    );
    expect(tplIns.error).not.toBeNull();
    const invite = await attempt("insert into public.invitations (org_id) values ($1)", [orgB]);
    expect(invite.error).not.toBeNull();
  });

  it("does not let an owner change their own plan", async () => {
    await actAs(ownerA);
    const res = await attempt("update public.organizations set plan_id = 'pro' where id = $1", [orgA]);
    expect(res.error).not.toBeNull();
  });

  it("does not let a user add themselves to another business", async () => {
    await actAs(ownerA);
    const res = await attempt("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'owner')", [
      orgB,
      ownerA,
    ]);
    expect(res.error).not.toBeNull();
  });

  it("lets a manager use templates but not change business settings or the team", async () => {
    await actAs(managerA);
    const orgs = await db.query("select id from public.organizations");
    expect(orgs.rows.map((r) => r.id)).toEqual([orgA]);

    const tpl = await attempt("update public.message_templates set body = 'Hello' where org_id = $1", [orgA]);
    expect(tpl.rowCount).toBe(1);

    const settings = await attempt("update public.organizations set name = 'Renamed' where id = $1", [orgA]);
    expect(settings.rowCount).toBe(0);

    const invite = await attempt("insert into public.invitations (org_id) values ($1)", [orgA]);
    expect(invite.error).not.toBeNull();

    const remove = await attempt("delete from public.memberships where org_id = $1 and user_id = $2", [orgA, ownerA]);
    expect(remove.rowCount).toBe(0);
  });

  it("lets teammates see each other's names, but not other businesses' people", async () => {
    await actAs(managerA);
    const res = await db.query("select full_name from public.profiles order by full_name");
    expect(res.rows.map((r) => r.full_name)).toEqual(["Manager A", "Owner A"]);
  });

  it("rejects used and unknown invitation links", async () => {
    await actAs(ownerB);
    const unknown = await attempt("select public.accept_invitation('not-a-real-token')");
    expect(unknown.error?.message).toMatch(/invalid or has expired/);
  });

  it("enforces the plan's user limit when accepting invitations", async () => {
    // Pilot plan allows 3 users; org A has 2. Fill the last seat, then try one more.
    const extra1 = randomUUID();
    const extra2 = randomUUID();
    await db.query("reset role");
    await db.query("insert into auth.users (id, email) values ($1, 'x1@example.com'), ($2, 'x2@example.com')", [
      extra1,
      extra2,
    ]);
    await actAs(ownerA);
    const t1 = (await db.query("insert into public.invitations (org_id) values ($1) returning token", [orgA])).rows[0]
      .token;
    const t2 = (await db.query("insert into public.invitations (org_id) values ($1) returning token", [orgA])).rows[0]
      .token;
    await actAs(extra1);
    expect((await attempt("select public.accept_invitation($1)", [t1])).error).toBeNull();
    await actAs(extra2);
    const over = await attempt("select public.accept_invitation($1)", [t2]);
    expect(over.error?.message).toMatch(/user limit/);
  });

  describe("contacts, leads, messages and consent (Milestone 1)", () => {
    let contactB = "";

    beforeAll(async () => {
      await actAs(ownerB);
      contactB = (
        await db.query("insert into public.contacts (org_id, phone, name) values ($1, '+18435550100', 'Pat') returning id", [
          orgB,
        ])
      ).rows[0].id;
      await db.query("insert into public.leads (org_id, contact_id, source) values ($1, $2, 'manual')", [orgB, contactB]);
      await db.query("reset role"); // the server writes messages
      await db.query(
        "insert into public.messages (org_id, contact_id, direction, body, sender_type, status) values ($1, $2, 'inbound', 'hi', 'contact', 'received')",
        [orgB, contactB],
      );
    });

    it("keeps each business's customers and conversations private", async () => {
      await actAs(ownerA);
      for (const table of ["contacts", "leads", "messages", "consent_events", "phone_numbers", "notifications", "scheduled_messages", "jobs"]) {
        const res = await db.query(`select * from public.${table} where org_id = $1`, [orgB]);
        expect(res.rowCount, table).toBe(0);
      }
      await actAs(ownerB);
      expect((await db.query("select * from public.messages")).rowCount).toBe(1);
    });

    it("won't let one business add contacts or leads to another", async () => {
      await actAs(ownerA);
      const c = await attempt("insert into public.contacts (org_id, phone) values ($1, '+18435550101')", [orgB]);
      expect(c.error).not.toBeNull();
      const l = await attempt("insert into public.leads (org_id, contact_id) values ($1, $2)", [orgB, contactB]);
      expect(l.error).not.toBeNull();
    });

    it("only changes consent through the logged function", async () => {
      await actAs(ownerB);
      const direct = await attempt("update public.contacts set opted_out_at = null where id = $1", [contactB]);
      expect(direct.error).not.toBeNull();

      await db.query("select public.record_consent_event($1, $2, 'opt_out', 'owner_recorded', 'Asked on the phone')", [
        orgB,
        contactB,
      ]);
      const row = await db.query("select opted_out_at from public.contacts where id = $1", [contactB]);
      expect(row.rows[0].opted_out_at).not.toBeNull();
      const log = await db.query("select kind, recorded_by from public.consent_events where contact_id = $1", [contactB]);
      expect(log.rows).toEqual([{ kind: "opt_out", recorded_by: ownerB }]);

      const tamper = await attempt("delete from public.consent_events where contact_id = $1", [contactB]);
      expect(tamper.rowCount).toBe(0);
    });

    it("blocks recording consent for another business's contact", async () => {
      await actAs(ownerA);
      const res = await attempt("select public.record_consent_event($1, $2, 'marketing_granted', 'owner_recorded')", [
        orgB,
        contactB,
      ]);
      expect(res.error?.message).toMatch(/Not allowed/);
    });

    it("lets team members write messages only through the server", async () => {
      await actAs(ownerB);
      const res = await attempt(
        "insert into public.messages (org_id, contact_id, direction, body, sender_type, status) values ($1, $2, 'outbound', 'x', 'user', 'sent')",
        [orgB, contactB],
      );
      expect(res.error).not.toBeNull();
    });

    it("sets lead stage dates automatically", async () => {
      await actAs(ownerB);
      const lead = await db.query(
        "update public.leads set stage = 'estimate_sent' where org_id = $1 returning estimate_sent_at",
        [orgB],
      );
      expect(lead.rows[0].estimate_sent_at).not.toBeNull();
    });

    it("shows carrier registration only to the owner", async () => {
      await actAs(ownerA);
      expect((await db.query("select * from public.a2p_registrations")).rowCount).toBe(1);
      await actAs(managerA);
      expect((await db.query("select * from public.a2p_registrations")).rowCount).toBe(0);
      await actAs(ownerA);
      const approve = await attempt("update public.a2p_registrations set status = 'approved' where org_id = $1", [orgA]);
      expect(approve.error).not.toBeNull();
    });
  });

  it("gives logged-out visitors nothing", async () => {
    await actAsAnonymous();
    for (const table of ["organizations", "message_templates", "memberships", "profiles", "plans", "contacts", "leads", "messages"]) {
      const res = await attempt(`select * from public.${table}`);
      expect(res.rowCount, table).toBe(0);
    }
    const create = await attempt(
      "select public.create_organization('X', 'project', 'en', '[]'::jsonb)",
    );
    expect(create.error).not.toBeNull();
  });
});
