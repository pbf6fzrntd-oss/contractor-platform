import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Shared by the network PostgreSQL suite and a local PostgreSQL WASM check.
export async function recoveryCases(db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) {
  const org = randomUUID();
  const q = async (sql: string, values?: unknown[]) => (await db.query(sql, values)).rows;
  await q("insert into public.organizations(id,name,business_type) values($1,'Recovery Example','project')", [org]);
  try {
    const contact = (await q("insert into public.contacts(org_id,phone) values($1,'+18435550199') returning id", [org]))[0].id;
    const booking = (day: string, extra = {}) => ({ org_id: org, contact_id: contact, mode: "day_capacity", status: "confirmed", starts_at: `${day}T12:00:00Z`, ends_at: `${day}T21:00:00Z`, service_date: day, ...extra });
    const book = async (row: object) => (await q("select public.book_slot($1::jsonb,'day',1) as id", [JSON.stringify(row)]))[0].id;
    const original = await book(booking("2030-10-10"));
    await book(booking("2030-10-11"));
    await assert.rejects(book(booking("2030-10-11", { rescheduled_from: original })), /^error: FULL|^FULL/);
    assert.equal((await q("select status from public.bookings where id=$1", [original]))[0].status, "confirmed");
    const moved = await book(booking("2030-10-12", { rescheduled_from: original, status: "pending_approval", approval_reasons: ["Customer move"] }));
    assert.equal((await q("select status from public.bookings where id=$1", [original]))[0].status, "canceled");
    assert.equal((await q("select count(*)::int as n from public.approval_requests where booking_id=$1 and status='pending'", [moved]))[0].n, 1);
    await assert.rejects(book(booking("2030-10-13", { rescheduled_from: original })), /CHANGED/);

    const agreement = (await q("insert into public.rh_agreements(org_id,contact_id,name,starts_on,ends_on) values($1,$2,'Example plan','2030-01-01','2030-12-31') returning id", [org,contact]))[0].id;
    const reminder = async (sendAt: string | null) => (await q("select public.queue_agreement_reminder($1,$2,'2030-12-31','{}'::jsonb,$3) as ok", [org,agreement,sendAt]))[0].ok;
    await assert.rejects(reminder(null));
    assert.equal((await q("select renewal_notice_for from public.rh_agreements where id=$1", [agreement]))[0].renewal_notice_for,null);
    assert.equal(await reminder("2030-12-01T12:00:00Z"), true);
    assert.equal(await reminder("2030-12-01T12:00:00Z"), false);
    assert.equal((await q("select count(*)::int as n from public.scheduled_messages where org_id=$1", [org]))[0].n, 1);

    const message = { org_id: org,contact_id: contact,body:"Fictional text",category:"informational",sender_type:"automation" };
    const reserve = async (key: string, fingerprint = "same") => (await q("select public.reserve_sms_attempt($1::jsonb,'2030-10-01',1,$2,$3) as result", [JSON.stringify(message),key,fingerprint]))[0].result as { fresh?: boolean; limited?: boolean; message_id?: string; state?: string };
    const first = await reserve("outbox-example");
    assert.equal(first.fresh,true);
    assert.equal((await reserve("outbox-example")).fresh,false);
    assert.equal((await reserve("different-outbox")).limited,true);
    await assert.rejects(reserve("outbox-example","changed"), /REQUEST_KEY_REUSED/);
    await q("select public.finish_sms_attempt($1,'outbox-example','unknown','queued',null,'delivery_unknown')",[org]);
    assert.equal((await reserve("outbox-example")).state,"unknown");
    assert.equal((await q("select sms_sent from public.usage_counters where org_id=$1",[org]))[0].sms_sent,1);
    await q("update public.sms_attempts set created_at=now()-interval '3 minutes' where org_id=$1 and request_key='outbox-example'",[org]);
    await assert.rejects(q("select public.reconcile_sms_attempt($1,'outbox-example','accepted','Provider receipt reviewed','admin@example.invalid',null)",[org]),/EVIDENCE_REQUIRED/);
    await q("select public.reconcile_sms_attempt($1,'outbox-example','rejected','Provider confirmed rejection receipt #example','admin@example.invalid',null)",[org]);
    assert.equal((await q("select sms_sent from public.usage_counters where org_id=$1 and month='2030-10-01'",[org]))[0].sms_sent,0);
    assert.equal((await q("select count(*)::int as n from public.sms_reconciliations where org_id=$1",[org]))[0].n,1);
    const permissions=await q("select has_function_privilege('authenticated','public.reconcile_sms_attempt(uuid,text,text,text,text,text)','execute') as auth, has_function_privilege('anon','public.reserve_sms_attempt(jsonb,date,integer,text,text)','execute') as anon");
    assert.deepEqual(permissions[0],{auth:false,anon:false});
    // A separate month: definitive rejection releases the reservation once.
    const rejected = {...message,body:"Definitively rejected"};
    await q("select public.reserve_sms_attempt($1::jsonb,'2030-11-01',1,'rejected-example','other')",[JSON.stringify(rejected)]);
    await q("select public.finish_sms_attempt($1,'rejected-example','rejected','failed',null,'rejected')",[org]);
    await q("select public.finish_sms_attempt($1,'rejected-example','rejected','failed',null,'rejected')",[org]);
    assert.equal((await q("select sms_sent from public.usage_counters where org_id=$1 and month='2030-11-01'",[org]))[0].sms_sent,0);

    const subscription = `sub_${org}`; const event = `evt_${org}`;
    const claim = (await q("select public.claim_billing_sync($1,$2) as claim",[subscription,event]))[0].claim as {token:string};
    assert.equal(((await q("select public.claim_billing_sync($1,$2) as claim",[subscription,event]))[0].claim as {busy:boolean}).busy,true);
    await q("insert into public.org_modules(org_id,module,source) values($1,'home_services','pilot') on conflict(org_id,module) do update set source='pilot'",[org]);
    const snapshot = {org_id:org,subscription_id:subscription,customer_id:`cus_${org}`,status:"active",period_end:null,plan_id:"does-not-exist",active:true,addons:[{key:"home_services",itemId:"si_example"}]};
    await assert.rejects(q("select public.apply_billing_snapshot($1::jsonb,$2,$3)",[JSON.stringify(snapshot),event,claim.token]));
    assert.equal((await q("select count(*)::int as n from public.billing_events where event_id=$1",[event]))[0].n,0);
    snapshot.plan_id="pilot";
    await q("select public.apply_billing_snapshot($1::jsonb,$2,$3)",[JSON.stringify(snapshot),event,claim.token]);
    assert.equal((await q("select source from public.org_modules where org_id=$1 and module='home_services'",[org]))[0].source,"pilot");
    assert.equal(((await q("select public.claim_billing_sync($1,$2) as claim",[subscription,event]))[0].claim as {done:boolean}).done,true);
    await q("delete from public.billing_events where event_id=$1",[event]);
    const ip = `ip_${org}`;
    assert.equal((await q("select public.reserve_public_request($1,'demo',1,60,0,300,null) as ok",[ip]))[0].ok,true);
    assert.equal((await q("select public.reserve_public_request($1,'demo',1,60,0,300,null) as ok",[ip]))[0].ok,false);
    await q("delete from public.public_request_log where ip_hash=$1",[ip]);
  } finally { await q("delete from public.organizations where id=$1",[org]); }
}
