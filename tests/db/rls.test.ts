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
      for (const table of ["contacts", "leads", "messages", "consent_events", "phone_numbers", "notifications", "scheduled_messages", "jobs", "recurring_services", "service_date_moves"]) {
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

  describe("AI assistant keys and activity (Milestone 12)", () => {
    beforeAll(async () => {
      await db.query("reset role"); // keys are created by the server
      await db.query(
        "insert into public.api_keys (org_id, name, key_prefix, key_hash, access) values ($1, 'Claude', 'llk_aaaaaa', 'hash-a', 'read_write'), ($2, 'Other', 'llk_bbbbbb', 'hash-b', 'read')",
        [orgA, orgB],
      );
      await db.query("insert into public.agent_activity (org_id, tool, summary) values ($1, 'list_leads', 'Listed 3 leads')", [orgA]);
    });

    it("shows keys only to the owner of that business", async () => {
      await actAs(ownerA);
      expect((await db.query("select name from public.api_keys")).rows).toEqual([{ name: "Claude" }]);
      await actAs(managerA);
      expect((await db.query("select * from public.api_keys")).rowCount).toBe(0);
      await actAs(ownerB);
      expect((await db.query("select name from public.api_keys")).rows).toEqual([{ name: "Other" }]);
    });

    it("lets an office manager see only the connections they made (Milestone 14)", async () => {
      await db.query("reset role");
      await db.query(
        "insert into public.api_keys (org_id, name, key_prefix, key_hash, access, created_by) values ($1, 'Manager Claude', 'llk_cccccc', 'hash-c', 'read_write', $2)",
        [orgA, managerA],
      );
      await actAs(managerA);
      expect((await db.query("select name from public.api_keys")).rows).toEqual([{ name: "Manager Claude" }]);
      const upd = await attempt("update public.api_keys set access = 'full' where org_id = $1", [orgA]);
      expect(upd.error).not.toBeNull();
      await actAs(ownerA);
      expect((await db.query("select name from public.api_keys order by name")).rows).toEqual([{ name: "Claude" }, { name: "Manager Claude" }]);
      await actAs(ownerB);
      expect((await db.query("select name from public.api_keys")).rows).toEqual([{ name: "Other" }]);
    });

    it("never lets anyone create, change or read key hashes of another business directly", async () => {
      await actAs(ownerA);
      const ins = await attempt("insert into public.api_keys (org_id, name, key_prefix, key_hash) values ($1, 'x', 'x', 'x')", [orgA]);
      expect(ins.error).not.toBeNull();
      const upd = await attempt("update public.api_keys set access = 'read_write' where org_id = $1", [orgB]);
      expect(upd.rowCount).toBe(0);
    });

    it("keeps one-tap connect records completely server-only", async () => {
      await actAs(ownerA);
      for (const table of ["oauth_clients", "oauth_codes"]) {
        const read = await attempt(`select * from public.${table}`);
        expect(read.error, table).not.toBeNull();
      }
      const add = await attempt("insert into public.oauth_clients (client_name, redirect_uris) values ('x', '{https://x.test/cb}')");
      expect(add.error).not.toBeNull();
    });

    it("keeps the assistant activity log private and tamper-proof", async () => {
      await actAs(managerA);
      expect((await db.query("select summary from public.agent_activity")).rows).toEqual([{ summary: "Listed 3 leads" }]);
      await actAs(ownerB);
      expect((await db.query("select * from public.agent_activity")).rowCount).toBe(0);
      await actAs(ownerA);
      expect((await attempt("delete from public.agent_activity where org_id = $1", [orgA])).rowCount).toBe(0);
    });
  });

  describe("industries and modules (Milestone 15)", () => {
    it("gives every new business Home Services and keeps old onboarding calls working", async () => {
      await actAs(ownerA);
      expect((await db.query("select module, enabled from public.org_modules")).rows).toEqual([{ module: "home_services", enabled: true }]);
      const industry = await db.query("select industry from public.organizations where id = $1", [orgA]);
      expect(industry.rows[0].industry).toBeNull();
    });

    it("saves the industry picked at onboarding", async () => {
      const newOwner = randomUUID();
      await db.query("reset role");
      await db.query("insert into auth.users (id, email) values ($1, 'hvac@example.com')", [newOwner]);
      await actAs(newOwner);
      const id = (await db.query("select public.create_organization('Cool Air', 'project', 'en', '[]'::jsonb, null, null, 'hvac') as id")).rows[0].id;
      expect((await db.query("select industry from public.organizations where id = $1", [id])).rows[0].industry).toBe("hvac");
      const bad = await attempt("select public.create_organization('X', 'project', 'en', '[]'::jsonb, null, null, 'Not Valid!')");
      expect(bad.error).not.toBeNull();
    });

    it("keeps modules private and server-controlled", async () => {
      await actAs(ownerA);
      expect((await db.query("select * from public.org_modules where org_id = $1", [orgB])).rowCount).toBe(0);
      expect((await attempt("insert into public.org_modules (org_id, module) values ($1, 'pet_care')", [orgA])).error).not.toBeNull();
      expect((await attempt("update public.org_modules set enabled = false where org_id = $1", [orgA])).error).not.toBeNull();
    });

    it("lets only the owner change the industry", async () => {
      await actAs(managerA);
      expect((await attempt("update public.organizations set industry = 'roofing' where id = $1", [orgA])).rowCount).toBe(0);
      await actAs(ownerA);
      expect((await attempt("update public.organizations set industry = 'roofing' where id = $1", [orgA])).rowCount).toBe(1);
      expect((await attempt("update public.organizations set industry = 'roofing' where id = $1", [orgB])).rowCount).toBe(0);
    });
  });

  describe("customer records, private details, files and licenses (Milestone 18)", () => {
    let contactA = "";
    let contactB2 = "";
    let subjectB = "";

    beforeAll(async () => {
      await actAs(ownerA);
      contactA = (await db.query("insert into public.contacts (org_id, phone) values ($1, '+18435550300') returning id", [orgA])).rows[0].id;
      await actAs(ownerB);
      contactB2 = (await db.query("insert into public.contacts (org_id, phone) values ($1, '+18435550301') returning id", [orgB])).rows[0].id;
      subjectB = (
        await db.query("insert into public.subjects (org_id, contact_id, kind, label, attributes) values ($1, $2, 'pet', 'Buddy', '{\"breed\":\"Lab\"}') returning id", [orgB, contactB2])
      ).rows[0].id;
      await db.query("insert into public.subject_private (subject_id, org_id, behavior_notes) values ($1, $2, 'bites')", [subjectB, orgB]);
      await db.query("reset role");
      await db.query(
        "insert into public.files (org_id, contact_id, subject_id, kind, storage_path, content_type, size_bytes) values ($1, $2, $3, 'vaccination_record', $4, 'application/pdf', 100)",
        [orgB, contactB2, subjectB, `${orgB}/2026/x.pdf`],
      );
      await actAs(ownerB);
      await db.query("insert into public.business_credentials (org_id, kind, label) values ($1, 'license', 'Kennel permit')", [orgB]);
    });

    it("hides another business's records, private details, files and licenses", async () => {
      await actAs(ownerA);
      for (const table of ["subjects", "subject_private", "files", "business_credentials"]) {
        expect((await db.query(`select * from public.${table} where org_id = $1`, [orgB])).rowCount, table).toBe(0);
      }
      expect((await attempt("update public.subject_private set behavior_notes = 'x' where subject_id = $1", [subjectB])).rowCount).toBe(0);
    });

    it("won't attach a record to another business's customer, even inside your own business", async () => {
      await actAs(ownerA);
      const cross = await attempt("insert into public.subjects (org_id, contact_id, kind, label) values ($1, $2, 'pet', 'Stolen')", [orgA, contactB2]);
      expect(cross.error?.message).toMatch(/different business/);
      const intoB = await attempt("insert into public.subjects (org_id, contact_id, kind, label) values ($1, $2, 'pet', 'X')", [orgB, contactB2]);
      expect(intoB.error).not.toBeNull();
      const privCross = await attempt("insert into public.subject_private (subject_id, org_id, vin) values ($1, $2, '1HGCM82633A004352')", [subjectB, orgA]);
      expect(privCross.error).not.toBeNull();
    });

    it("lets office managers keep records and private notes for their own business", async () => {
      await actAs(managerA);
      const id = (await db.query("insert into public.subjects (org_id, contact_id, kind, label) values ($1, $2, 'property', '1 Main St') returning id", [orgA, contactA])).rows[0].id;
      await db.query("insert into public.subject_private (subject_id, org_id, access_notes) values ($1, $2, 'Gate 1234')", [id, orgA]);
      expect((await db.query("select access_notes from public.subject_private where subject_id = $1", [id])).rows[0].access_notes).toBe("Gate 1234");
      expect((await attempt("insert into public.subject_private (subject_id, org_id, vin) values ($1, $2, 'NOT-A-VIN')", [id, orgA])).error).not.toBeNull();
    });

    it("only lets the server record file uploads", async () => {
      await actAs(ownerB);
      expect((await db.query("select kind from public.files")).rows).toEqual([{ kind: "vaccination_record" }]);
      const ins = await attempt(
        "insert into public.files (org_id, kind, storage_path, content_type, size_bytes) values ($1, 'photo', $2, 'image/jpeg', 10)",
        [orgB, `${orgB}/2026/y.jpg`],
      );
      expect(ins.error).not.toBeNull();
      expect((await attempt("update public.files set deleted_at = now() where org_id = $1", [orgB])).error).not.toBeNull();
    });

    it("lets only the owner change licenses and insurance", async () => {
      await actAs(managerA);
      expect((await attempt("insert into public.business_credentials (org_id, kind, label) values ($1, 'license', 'x')", [orgA])).error).not.toBeNull();
      await actAs(ownerA);
      expect((await attempt("insert into public.business_credentials (org_id, kind, label) values ($1, 'insurance', 'Liability')", [orgA])).error).toBeNull();
      await actAs(managerA);
      expect((await db.query("select label from public.business_credentials")).rows).toEqual([{ label: "Liability" }]);
    });

    it("gives logged-out visitors none of it", async () => {
      await actAsAnonymous();
      for (const table of ["subjects", "subject_private", "files", "business_credentials"]) {
        const r = await attempt(`select * from public.${table}`);
        expect(r.rowCount, table).toBe(0);
      }
    });
  });

  describe("bookings (Milestone 19)", () => {
    let contactA = "";
    let serviceA = "";
    let groomer = "";
    const book = (extra: Record<string, unknown>, scope: string, cap: number | null = null) =>
      attempt("select public.book_slot($1::jsonb, $2, $3) as id", [JSON.stringify({ org_id: orgA, contact_id: contactA, service_id: serviceA, ...extra }), scope, cap]);

    beforeAll(async () => {
      await actAs(ownerA);
      contactA = (await db.query("insert into public.contacts (org_id, phone) values ($1, '+18435550400') returning id", [orgA])).rows[0].id;
      serviceA = (await db.query("insert into public.service_catalog (org_id, name, booking_mode) values ($1, 'Estimate', 'arrival_window') returning id", [orgA])).rows[0].id;
      groomer = (await db.query("insert into public.resources (org_id, name, kind) values ($1, 'Sam', 'groomer') returning id", [orgA])).rows[0].id;
      await db.query("reset role"); // book_slot runs on the server
    });

    it("fills an arrival window to capacity, then refuses", async () => {
      await db.query("reset role");
      const w = { mode: "arrival_window", starts_at: "2026-10-05T12:00:00Z", ends_at: "2026-10-05T14:00:00Z", service_date: "2026-10-05" };
      expect((await book(w, "window", 2)).error).toBeNull();
      expect((await book({ ...w, status: "pending_approval" }, "window", 2)).error).toBeNull();
      expect((await book(w, "window", 2)).error?.message).toMatch(/^FULL/);
    });

    it("never double-books a groomer, even with travel buffers", async () => {
      await db.query("reset role");
      const appt = { mode: "fixed_appointment", resource_id: groomer, starts_at: "2026-10-06T13:00:00Z", ends_at: "2026-10-06T14:00:00Z", service_date: "2026-10-06" };
      expect((await book(appt, "resource")).error).toBeNull();
      expect((await book({ ...appt, starts_at: "2026-10-06T13:30:00Z", ends_at: "2026-10-06T14:30:00Z" }, "resource")).error?.message).toMatch(/^OVERLAP/);
      expect((await book({ ...appt, starts_at: "2026-10-06T14:00:00Z", ends_at: "2026-10-06T15:00:00Z" }, "resource")).error).toBeNull(); // back-to-back is fine
      const withTravel = { ...appt, starts_at: "2026-10-06T15:10:00Z", ends_at: "2026-10-06T16:00:00Z", travel_before_minutes: 20 };
      expect((await book(withTravel, "resource")).error?.message).toMatch(/^OVERLAP/);
    });

    it("checks every night of a stay", async () => {
      await db.query("reset role");
      const stay = (ci: string, co: string) => ({ mode: "multi_day_reservation", unit_class: "large", check_in: ci, check_out: co, service_date: ci, starts_at: `${ci}T12:00:00Z`, ends_at: `${co}T12:00:00Z` });
      expect((await book(stay("2026-11-24", "2026-11-27"), "nights", 1)).error).toBeNull();
      expect((await book(stay("2026-11-26", "2026-11-28"), "nights", 1)).error?.message).toMatch(/^FULL: 2026-11-26/);
      expect((await book(stay("2026-11-27", "2026-11-29"), "nights", 1)).error).toBeNull(); // arrives the day the other leaves
    });

    it("stops a package at zero sessions", async () => {
      await db.query("reset role");
      const pkg = (await db.query("insert into public.packages (org_id, contact_id, name, sessions_total) values ($1, $2, '2 lessons', 2) returning id", [orgA, contactA])).rows[0].id;
      const lesson = (h: number) => ({ mode: "package_sessions", package_id: pkg, starts_at: `2026-10-07T${h}:00:00Z`, ends_at: `2026-10-07T${h}:45:00Z`, service_date: "2026-10-07" });
      expect((await book(lesson(13), "none")).error).toBeNull();
      expect((await book(lesson(14), "none")).error).toBeNull();
      expect((await book(lesson(15), "none")).error?.message).toMatch(/^NO_SESSIONS/);
    });

    it("keeps bookings private, and lets the team change only status and notes", async () => {
      await actAs(ownerB);
      expect((await db.query("select * from public.bookings where org_id = $1", [orgA])).rowCount).toBe(0);
      for (const t of ["service_catalog", "resources", "packages"]) expect((await db.query(`select * from public.${t} where org_id = $1`, [orgA])).rowCount, t).toBe(0);
      expect((await attempt("select public.book_slot('{}'::jsonb, 'none', null)")).error).not.toBeNull();
      await actAs(managerA);
      expect((await attempt("update public.bookings set status = 'completed' where org_id = $1 and mode = 'arrival_window'", [orgA])).error).toBeNull();
      expect((await attempt("update public.bookings set starts_at = now() where org_id = $1", [orgA])).error).not.toBeNull();
      expect((await attempt("insert into public.bookings (org_id, contact_id, mode, starts_at, ends_at, service_date) values ($1, $2, 'fixed_appointment', now(), now() + interval '1 hour', current_date)", [orgA, contactA])).error).not.toBeNull();
      expect((await attempt("insert into public.service_catalog (org_id, name, booking_mode) values ($1, 'x', 'day_capacity')", [orgA])).error).not.toBeNull();
      await actAsAnonymous();
      for (const t of ["bookings", "service_catalog", "resources", "packages"]) expect((await attempt(`select * from public.${t}`)).rowCount, t).toBe(0);
    });
  });

  it("keeps approvals private and server-controlled, and accepts the new lead sources (Milestone 20)", async () => {
    await db.query("reset role");
    const contact = (await db.query("insert into public.contacts (org_id, phone) values ($1, '+18435550500') returning id", [orgB])).rows[0].id;
    await db.query("insert into public.approval_requests (org_id, contact_id, reasons) values ($1, $2, '{Booked online}')", [orgB, contact]);
    for (const source of ["booking_page", "outside_agent", "voice", "ai_assistant"]) {
      await db.query("insert into public.leads (org_id, contact_id, source, stage) values ($1, $2, $3, 'won')", [orgB, contact, source]);
    }
    expect((await attempt("insert into public.leads (org_id, contact_id, source) values ($1, $2, 'bogus')", [orgB, contact])).error).not.toBeNull();
    await actAs(ownerA);
    expect((await db.query("select * from public.approval_requests where org_id = $1", [orgB])).rowCount).toBe(0);
    await actAs(ownerB);
    expect((await db.query("select reasons from public.approval_requests")).rows).toEqual([{ reasons: ["Booked online"] }]);
    expect((await attempt("update public.approval_requests set status = 'approved'")).error).not.toBeNull();
    expect((await attempt("insert into public.approval_requests (org_id) values ($1)", [orgB])).error).not.toBeNull();
    await actAsAnonymous();
    expect((await attempt("select * from public.approval_requests")).rowCount).toBe(0);
  });

  it("offers Executive and Enterprise, keeps old plans' switches, and protects the add-on catalog (Milestone 21)", async () => {
    await actAs(ownerA);
    const plans = (await db.query("select id, feature_team_ai, feature_booking, feature_agent_ready, feature_campaigns, is_public from public.plans order by sort_order")).rows;
    expect(plans.map((p) => p.id)).toEqual(["pilot", "core", "pro", "executive", "enterprise"]);
    expect(plans.find((p) => p.id === "pro")).toMatchObject({ feature_campaigns: true, feature_booking: false, feature_agent_ready: false });
    expect(plans.find((p) => p.id === "executive")).toMatchObject({ feature_team_ai: true, feature_booking: true, feature_agent_ready: true, is_public: true });
    expect(plans.find((p) => p.id === "enterprise")?.is_public).toBe(false);
    expect((await db.query("select key from public.addon_catalog order by sort_order")).rows.map((r) => r.key)).toEqual(["agent_ready", "recurring_home", "project_quote", "pet_care", "automotive"]);
    expect((await attempt("update public.addon_catalog set monthly_price_cents = 0")).error).not.toBeNull();
    expect((await attempt("update public.organizations set edition = 'pet_care' where id = $1", [orgA])).error).not.toBeNull();
    expect((await db.query("select source from public.org_modules where org_id = $1", [orgA])).rows).toEqual([{ source: "edition" }]);
    await actAsAnonymous();
    expect((await attempt("select * from public.addon_catalog")).rowCount).toBe(0);
  });

  describe("public profile for customers and AI agents (Milestone 22)", () => {
    const SECRET = "SENTINEL-8841";
    beforeAll(async () => {
      await db.query("reset role");
      // Business A: pilot plan (includes Agent Ready), public profile ON, booking ON.
      await db.query("update public.organizations set slug = 'a-roofing', public_profile_enabled = true, booking_enabled = true, profile = $2 where id = $1", [
        orgA,
        JSON.stringify({ about: "Roofs since 2009", service_area: "Summerville", show_prices: true }),
      ]);
      await db.query("insert into public.service_catalog (org_id, name, booking_mode, price_from_cents, public) values ($1, 'Public inspection', 'arrival_window', 0, true), ($1, 'Hidden service', 'arrival_window', 100, false)", [orgA]);
      await db.query("insert into public.business_credentials (org_id, kind, label, show_on_profile, expires_on) values ($1, 'license', 'Shown license', true, null), ($1, 'license', 'Private license', false, null), ($1, 'insurance', 'Expired policy', true, '2020-01-01')", [orgA]);
      // Private things that must NEVER appear publicly.
      const c = (await db.query("insert into public.contacts (org_id, phone, name, address, notes) values ($1, '+18435550777', $2, $2, $2) returning id", [orgA, SECRET])).rows[0].id;
      const subj = (await db.query("insert into public.subjects (org_id, contact_id, kind, label, attributes) values ($1, $2, 'property', $3, $4) returning id", [orgA, c, SECRET, JSON.stringify({ address: SECRET })])).rows[0].id;
      await db.query("insert into public.subject_private (subject_id, org_id, access_notes, behavior_notes, care_notes) values ($1, $2, $3, $3, $3)", [subj, orgA, SECRET]);
      await db.query("insert into public.files (org_id, contact_id, subject_id, kind, storage_path, content_type, size_bytes, original_name) values ($1, $2, $3, 'photo', $4, 'image/jpeg', 10, $5)", [orgA, c, subj, `${orgA}/2026/${SECRET}.jpg`.replace(SECRET, "11111111-1111-4111-8111-111111111111"), SECRET]);
      await db.query("insert into public.leads (org_id, contact_id, notes) values ($1, $2, $3)", [orgA, c, SECRET]);
      // Business B: profile ON but on the Core plan without Agent Ready.
      await db.query("update public.organizations set slug = 'b-lawn', public_profile_enabled = true, plan_id = 'core' where id = $1", [orgB]);
    });

    it("shows a live business's allow-listed profile to anyone, and nothing private", async () => {
      await actAsAnonymous();
      const r = (await db.query("select public.public_business_profile('a-roofing') as p")).rows[0].p;
      expect(r.name).toBe("A Roofing");
      expect(r.about).toBe("Roofs since 2009");
      expect(r.booking_available).toBe(true);
      const names = r.services.map((s: { name: string }) => s.name);
      expect(names).toContain("Public inspection");
      expect(names).not.toContain("Hidden service");
      const creds = r.credentials.map((c: { label: string }) => c.label);
      expect(creds).toContain("Shown license");
      expect(creds).not.toContain("Private license");
      expect(creds).not.toContain("Expired policy");
      const text = JSON.stringify(r);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("+18435550777");
      expect(Object.keys(r).sort()).toEqual(["about", "booking_available", "business_type", "credentials", "hours", "industry", "name", "phone", "review_url", "service_area", "service_zips", "services", "slug", "timezone"]);
    });

    it("hides profiles that are off or not included in the plan, and unknown ones", async () => {
      await actAsAnonymous();
      expect((await db.query("select public.public_business_profile('b-lawn') as p")).rows[0].p).toBeNull();
      expect((await db.query("select public.public_business_profile('no-such-business') as p")).rows[0].p).toBeNull();
      await db.query("reset role");
      await db.query("update public.organizations set public_profile_enabled = false where id = $1", [orgA]);
      await actAsAnonymous();
      expect((await db.query("select public.public_business_profile('a-roofing') as p")).rows[0].p).toBeNull();
      await db.query("reset role");
      await db.query("update public.organizations set public_profile_enabled = true where id = $1", [orgA]);
    });

    it("turns on for Core with the Agent Ready add-on, and off if the account is canceled", async () => {
      await db.query("reset role");
      await db.query("insert into public.org_modules (org_id, module, source) values ($1, 'agent_ready', 'addon')", [orgB]);
      await actAsAnonymous();
      const p = (await db.query("select public.public_business_profile('b-lawn') as p")).rows[0].p;
      expect(p.name).toBe("B Lawn");
      expect(p.booking_available).toBe(false); // booking not switched on by the owner
      await db.query("reset role");
      await db.query("update public.subscriptions set status = 'canceled' where org_id = $1", [orgB]);
      await actAsAnonymous();
      expect((await db.query("select public.public_business_profile('b-lawn') as p")).rows[0].p).toBeNull();
    });

    it("keeps the server-only helpers and the request log away from the public", async () => {
      await actAsAnonymous();
      expect((await attempt("select public.public_profile_org('a-roofing')")).error).not.toBeNull();
      expect((await attempt("select * from public.public_request_log")).error).not.toBeNull();
      await actAs(ownerA);
      expect((await attempt("select public.public_profile_org('a-roofing')")).error).not.toBeNull();
      expect((await attempt("update public.organizations set slug = 'stolen' where id = $1", [orgB])).rowCount).toBe(0);
      await actAs(managerA);
      expect((await attempt("update public.organizations set public_profile_enabled = false where id = $1", [orgA])).rowCount).toBe(0);
    });
  });

  it("keeps sales audits completely server-only (Milestone 17)", async () => {
    await db.query("reset role");
    await db.query("insert into public.audit_reports (prospect_name, score) values ('Prospect Roofing', 42)");
    for (const who of [ownerA, managerA]) {
      await actAs(who);
      expect((await attempt("select * from public.audit_reports")).error, "read").not.toBeNull();
      expect((await attempt("insert into public.audit_reports (prospect_name, score) values ('x', 1)")).error, "insert").not.toBeNull();
    }
    await actAsAnonymous();
    expect((await attempt("select * from public.audit_reports")).error).not.toBeNull();
  });

  it("keeps once-a-day job records server-only and alert stages valid (Milestone 24)", async () => {
    await db.query("reset role");
    await db.query("insert into public.job_runs (job, run_on) values ('credential_expiry', '2026-10-01') on conflict do nothing");
    for (const who of [ownerA, managerA]) {
      await actAs(who);
      expect((await attempt("select * from public.job_runs")).error, "read").not.toBeNull();
      expect((await attempt("insert into public.job_runs (job, run_on) values ('x', '2026-10-02')")).error, "insert").not.toBeNull();
    }
    await actAsAnonymous();
    expect((await attempt("select * from public.job_runs")).error).not.toBeNull();
    await db.query("reset role");
    expect((await attempt("insert into public.job_runs (job, run_on) values ('credential_expiry', '2026-10-01')")).error, "once per day").not.toBeNull();
    expect((await attempt("insert into public.business_credentials (org_id, kind, label, expiry_alert_stage) values ($1, 'license', 'x', 'soon')", [orgA])).error).not.toBeNull();
  });

  it("keeps photos texted in to one business away from another (Milestone 24)", async () => {
    await db.query("reset role");
    const contact = (await db.query("insert into public.contacts (org_id, phone) values ($1, '+18435550424') returning id", [orgB])).rows[0].id;
    const msg = (await db.query("insert into public.messages (org_id, contact_id, direction, body, sender_type, status) values ($1, $2, 'inbound', '📷 Photo', 'contact', 'received') returning id", [orgB, contact])).rows[0].id;
    await db.query(
      "insert into public.files (org_id, contact_id, message_id, kind, storage_path, content_type, size_bytes) values ($1, $2, $3, 'photo', $4, 'image/jpeg', 10)",
      [orgB, contact, msg, `${orgB}/2026/texted-in.jpg`],
    );
    await actAs(ownerA);
    expect((await attempt("select * from public.files where message_id = $1", [msg])).rowCount).toBe(0);
    expect((await attempt("update public.files set subject_id = null where message_id = $1", [msg])).error).not.toBeNull();
    await actAs(ownerB);
    expect((await attempt("select id from public.files where message_id = $1", [msg])).rowCount).toBe(1);
  });

  it("gives logged-out visitors nothing", async () => {
    await actAsAnonymous();
    for (const table of ["organizations", "message_templates", "memberships", "profiles", "plans", "contacts", "leads", "messages", "org_modules", "api_keys"]) {
      const res = await attempt(`select * from public.${table}`);
      expect(res.rowCount, table).toBe(0);
    }
    const create = await attempt(
      "select public.create_organization('X', 'project', 'en', '[]'::jsonb)",
    );
    expect(create.error).not.toBeNull();
  });
});
