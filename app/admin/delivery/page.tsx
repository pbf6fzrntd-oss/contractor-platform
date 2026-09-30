import { requirePlatformAdmin } from "@/lib/auth/admin";
import { loadDeliveryQueue } from "@/lib/messaging/recovery";
import { DeliveryForm } from "./form";
export default async function DeliveryPage() {
 await requirePlatformAdmin();
 const data=await loadDeliveryQueue();
 return <><h1 className="text-2xl font-bold">Delivery review</h1><p className="mt-2 text-slate-600">Check the provider message receipts before recording an outcome. These attempts are held to prevent duplicate texts. Unresolved attempts keep their quota reservation. Recording an outcome sends no message.</p>
 {!data?.length&&<p className="mt-6">No unresolved attempts older than two minutes.</p>}
 <div className="mt-6 space-y-4">{data?.map(a=><section key={`${a.org_id}:${a.request_key}`} className="card"><h2 className="font-semibold break-all">{a.request_key}</h2><p className="hint break-all">Business: {a.org_id} · Message: {a.message_id} · {a.state} · {a.created_at}</p><DeliveryForm orgId={a.org_id} requestKey={a.request_key}/></section>)}</div></>;
}
