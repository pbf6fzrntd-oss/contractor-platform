import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("dedicated demo database guard", () => {
  it("blocks ordinary onboarding and demo conversion without changing ordinary deployments", async () => {
    const db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    async function attempt(sql: string, params: unknown[] = []) {
      await db.query("savepoint guard_attempt");
      try { const result = await db.query(sql, params); await db.query("release savepoint guard_attempt"); return { result, error: null }; }
      catch (error) { await db.query("rollback to savepoint guard_attempt"); return { result: null, error: error as Error }; }
    }
    try {
      // Lock the singleton so parallel test files never observe our uncommitted change.
      await db.query("select * from deployment_private.demo_settings for update");
      expect((await db.query("select demo_only from deployment_private.demo_settings")).rows[0].demo_only).toBe(false);
      const ordinary = randomUUID(), demo = randomUUID(), user = randomUUID();
      await db.query("insert into public.organizations(id,name,business_type) values($1,'Ordinary Example','project')", [ordinary]);
      await db.query("insert into auth.users(id,email) values($1,'guard@example.invalid')", [user]);
      await db.query("update deployment_private.demo_settings set demo_only=true");
      expect((await attempt("insert into public.organizations(name,business_type) values('Blocked','project')")).error?.message).toContain("fictional demo");
      await db.query("insert into public.organizations(id,name,business_type,is_demo) values($1,'Demo Example','project',true)", [demo]);
      expect((await attempt("update public.organizations set is_demo=false where id=$1", [demo])).error?.message).toContain("fictional demo");
      await db.query("update public.organizations set name='Edited Demo Example' where id=$1", [demo]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:user,role:"authenticated"})]);
      await db.query("set local role authenticated");
      expect((await attempt("select public.create_organization('Blocked RPC','project','en','[]'::jsonb,null,null,null)")).error?.message).toContain("fictional demo");
      expect((await attempt("update deployment_private.demo_settings set demo_only=false")).error?.message).toContain("permission denied");
      await db.query("reset role");
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect((await db.query("select has_table_privilege($1,'deployment_private.demo_settings','update') as allowed", [role])).rows[0].allowed).toBe(false);
        expect((await db.query("select has_function_privilege($1,'deployment_private.guard_demo_organization()','execute') as allowed", [role])).rows[0].allowed).toBe(false);
      }
      await db.query("update deployment_private.demo_settings set demo_only=false");
      expect((await attempt("insert into public.organizations(name,business_type) values('Restored Ordinary','project')")).error).toBeNull();
    } finally { await db.query("rollback"); await db.end(); }
  });
});
