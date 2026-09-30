/**
 * Two customers (or AI agents) try to take the LAST spot at the same moment,
 * on two separate database connections. Exactly one must win.
 * Runs against TEST_DATABASE_URL; cleans up after itself.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("booking the last spot at the same time", () => {
  const setup = new Client({ connectionString: url });
  const orgId = randomUUID();
  let contactId = "";

  beforeAll(async () => {
    await setup.connect();
    await setup.query("insert into public.organizations (id, name, business_type) values ($1, 'Race Test Movers', 'project')", [orgId]);
    contactId = (await setup.query("insert into public.contacts (org_id, phone) values ($1, '+18435550999') returning id", [orgId])).rows[0].id;
  });

  afterAll(async () => {
    await setup.query("delete from public.organizations where id = $1", [orgId]);
    await setup.end();
  });

  it("lets only one of two simultaneous bookings take the last move of the day", async () => {
    const booking = JSON.stringify({ org_id: orgId, contact_id: contactId, mode: "day_capacity", starts_at: "2026-10-09T12:00:00Z", ends_at: "2026-10-09T21:00:00Z", service_date: "2026-10-09" });
    const clients = [new Client({ connectionString: url }), new Client({ connectionString: url })];
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const attempt = async (c: Client) => {
        await c.query("begin");
        try {
          await c.query("select public.book_slot($1::jsonb, 'day', 1)", [booking]);
          await new Promise((r) => setTimeout(r, 150)); // hold the lock while the other tries
          await c.query("commit");
          return "booked";
        } catch (e) {
          await c.query("rollback");
          return (e as Error).message;
        }
      };
      const results = await Promise.all(clients.map(attempt));
      expect(results.filter((r) => r === "booked")).toHaveLength(1);
      expect(results.find((r) => r !== "booked")).toMatch(/^FULL/);
      const { rows } = await setup.query("select count(*)::int as n from public.bookings where org_id = $1", [orgId]);
      expect(rows[0].n).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("saves the new M23 fields (customer's YES deadline, approval reasons, moved-from)", async () => {
    const first = JSON.stringify({ org_id: orgId, contact_id: contactId, mode: "fixed_appointment", status: "requested", starts_at: "2026-10-12T13:00:00Z", ends_at: "2026-10-12T14:00:00Z", service_date: "2026-10-12", verify_by: "2026-10-01T14:00:00Z", pending_reasons: ["New customer"] });
    const id1 = (await setup.query("select public.book_slot($1::jsonb, 'none') as id", [first])).rows[0].id;
    const moved = JSON.stringify({ org_id: orgId, contact_id: contactId, mode: "fixed_appointment", starts_at: "2026-10-13T13:00:00Z", ends_at: "2026-10-13T14:00:00Z", service_date: "2026-10-13", rescheduled_from: id1 });
    const id2 = (await setup.query("select public.book_slot($1::jsonb, 'none') as id", [moved])).rows[0].id;
    const { rows } = await setup.query("select id, status, verify_by, pending_reasons, rescheduled_from, canceled_by from public.bookings where id = any($1) order by starts_at", [[id1, id2]]);
    expect(rows[0]).toMatchObject({ status: "canceled", pending_reasons: ["New customer"], rescheduled_from: null, canceled_by: "customer" });
    expect(rows[0].verify_by.toISOString()).toBe("2026-10-01T14:00:00.000Z");
    expect(rows[1]).toMatchObject({ pending_reasons: [], rescheduled_from: id1, verify_by: null });
    // Only known "canceled by" values, and approvals can now expire.
    await expect(setup.query("update public.bookings set canceled_by = 'hacker' where id = $1", [id1])).rejects.toThrow();
    await setup.query("update public.bookings set status = 'canceled', canceled_by = 'system' where id = $1", [id1]);
    await setup.query("insert into public.approval_requests (org_id, booking_id, reasons, status) values ($1, $2, '{x}', 'expired')", [orgId, id1]);
  });

  it("only the server can call book_slot (not signed-in users or visitors)", async () => {
    const { rows } = await setup.query(
      "select has_function_privilege('authenticated', 'public.book_slot(jsonb, text, integer)', 'execute') as auth, has_function_privilege('anon', 'public.book_slot(jsonb, text, integer)', 'execute') as anon",
    );
    expect(rows[0]).toEqual({ auth: false, anon: false });
  });
});
