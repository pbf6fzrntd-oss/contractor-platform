import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { recoveryCases } from "./recovery-cases";
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("transactional recovery", () => {
  it("preserves old bookings, deduplicates reminders and SMS, and commits billing atomically", async () => {
    const db = new Client({connectionString:url}); await db.connect();
    try { await recoveryCases(db); } finally { await db.end(); }
  });
  it("admits only one simultaneous public request at a limit of one", async () => {
    const clients=[new Client({connectionString:url}),new Client({connectionString:url})];
    await Promise.all(clients.map(c=>c.connect())); const ip=randomUUID();
    try {
      const results=await Promise.all(clients.map(c=>c.query("select public.reserve_public_request($1,'demo',1,60,0,0,null) as ok",[ip])));
      expect(results.filter(r=>r.rows[0].ok)).toHaveLength(1);
    } finally { await clients[0].query("delete from public.public_request_log where ip_hash=$1",[ip]); await Promise.all(clients.map(c=>c.end())); }
  });
  it("allows only one simultaneous rotation of a refresh token",async()=>{
    const clients=[new Client({connectionString:url}),new Client({connectionString:url})];
    await Promise.all(clients.map(c=>c.connect())); const org=randomUUID();
    try {
      await clients[0].query("insert into public.organizations(id,name,business_type) values($1,'OAuth Example','project')",[org]);
      const key=(await clients[0].query("insert into public.api_keys(org_id,name,key_prefix,key_hash,refresh_hash,refresh_expires_at) values($1,'Example','test', $2, 'old-refresh', now()+interval '1 hour') returning id",[org,randomUUID()])).rows[0].id;
      const results=await Promise.all(clients.map((c,i)=>c.query("update public.api_keys set refresh_hash=$2 where id=$1 and refresh_hash='old-refresh' and revoked_at is null and refresh_expires_at>now() returning id",[key,`new-refresh-${i}`])));
      expect(results.reduce((n,r)=>n+r.rows.length,0)).toBe(1);
    } finally {await clients[0].query("delete from public.organizations where id=$1",[org]);await Promise.all(clients.map(c=>c.end()));}
  });

});
