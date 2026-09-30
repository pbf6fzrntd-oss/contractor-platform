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
});
