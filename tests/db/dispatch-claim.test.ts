import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("scoped atomic dispatch", () => {
  it("excludes canceled/future rows, scopes claims and admits one concurrent winner", async () => {
    const clients = [new Client({ connectionString: url }), new Client({ connectionString: url })];
    await Promise.all(clients.map(c => c.connect()));
    const org = randomUUID(), other = randomUUID(), db = clients[0];
    try {
      for (const id of [org, other]) await db.query("insert into public.organizations(id,name,business_type) values($1,'Claim Example','project')", [id]);
      const contact = (await db.query("insert into public.contacts(org_id,phone) values($1,'+18435550199') returning id", [org])).rows[0].id;
      const insert = async (status: string, at: string) => (await db.query("insert into public.scheduled_messages(org_id,contact_id,kind,category,status,send_at) values($1,$2,'review_request','informational',$3,$4) returning id", [org, contact, status, at])).rows[0].id;
      const due = await insert("pending", "2000-01-01"), future = await insert("pending", "2099-01-01"), canceled = await insert("canceled", "2000-01-01");
      expect((await db.query("select * from public.claim_scheduled_messages(now(),100,$1)", [other])).rows).toHaveLength(0);
      await expect(db.query("select * from public.claim_scheduled_messages(now(),100,$1,null,null,true)", [org])).rejects.toThrow("simulator");
      const claimed = await Promise.all(clients.map(c => c.query("select * from public.claim_scheduled_messages(now(),100,$1)", [org])));
      expect(claimed.flatMap(r => r.rows).map(r => r.id)).toEqual([due]);
      expect((await db.query("select * from public.claim_scheduled_messages(now(),100,$1,null,'{}'::uuid[])", [org])).rows).toHaveLength(0);
      await db.query("insert into public.phone_numbers(org_id,e164,provider) values($1,'+15550000199','simulator')", [org]);
      const ff = await Promise.all(clients.map(c => c.query("select * from public.claim_scheduled_messages(now(),100,$1,null,$2,true)", [org, [future, canceled]])));
      expect(ff.flatMap(r => r.rows).map(r => r.id)).toEqual([future]);
      expect((await db.query("select status from public.scheduled_messages where id=$1", [canceled])).rows[0].status).toBe("canceled");
      const privilege = await db.query("select has_function_privilege('authenticated','public.claim_scheduled_messages(timestamptz,integer,uuid,uuid,uuid[],boolean)','execute') as allowed");
      expect(privilege.rows[0].allowed).toBe(false);
    } finally {
      await db.query("delete from public.organizations where id=any($1::uuid[])", [[org, other]]);
      await Promise.all(clients.map(c => c.end()));
    }
  });
});
