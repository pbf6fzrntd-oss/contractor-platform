import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";
import { sendToContact, type Contact, type SendingContext } from "@/lib/messaging/send";
const provider = vi.hoisted(() => ({sendSms:vi.fn(), throws:false, calls:0}));
vi.mock("@/lib/messaging/provider", () => ({getProvider:()=>({sendSms:async()=>{ provider.calls++; if(provider.throws) throw new Error("timeout after acceptance"); return provider.sendSms(); }})}));
const contact = {id:"contact",phone:"+18435550199",preferred_language:"en",opted_out_at:null,marketing_consent_at:null} as Contact;
const context = (): SendingContext => ({orgId:"org",timezone:"UTC",phone:{e164:"+18435550198",provider:"simulator",messaging_service_sid:null} as SendingContext["phone"],textingApproved:true,subscriptionStatus:"active",monthlyLimit:10,sentThisMonth:0});
function fakeDb(finishFails=false, limited=false) {
  let row: {fingerprint:string;message_id:string;state:string} | null=null;
  const rpc=vi.fn(async (name:string,args:Record<string,unknown>)=>{
    if(name==="reserve_sms_attempt") {
      if(limited) return {data:{limited:true},error:null};
      row={fingerprint:String(args.p_fingerprint),message_id:"message-1",state:"submitting"};
      return {data:{fresh:true,message_id:"message-1",usage:1},error:null};
    }
    if(name==="finish_sms_attempt") {
      if(finishFails) return {data:null,error:{message:"write failed"}};
      if(row) row.state=String(args.p_state);
      return {data:true,error:null};
    }
    return {data:true,error:null};
  });
  const from=(table:string)=>{
    const result=()=>table==="sms_attempts" ? {data:row,error:null} : {data:{id:"blocked"},count:0,error:null};
    const chain={select:()=>chain,eq:()=>chain,neq:()=>chain,insert:()=>chain,
      maybeSingle:async()=>result(),single:async()=>result(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
    return chain;
  };
  return {db:{from,rpc} as unknown as AdminClient,rpc};
}
const input={contact,body:"Example transactional text",category:"informational" as const,senderType:"automation" as const,requestKey:"outbox:example"};
beforeEach(()=>{provider.sendSms.mockReset();provider.throws=false;provider.calls=0;});
describe("provider delivery recovery",()=>{
  it("retains an ambiguous attempt and never resends it",async()=>{
    const {db}=fakeDb(); provider.throws=true;
    expect(await sendToContact(db,context(),input)).toMatchObject({status:"failed",reason:"delivery_unknown"});
    expect(await sendToContact(db,context(),input)).toMatchObject({status:"failed",reason:"delivery_unknown"});
    expect(provider.calls).toBe(1);
  });
  it("does not resend after provider acceptance and a failed database write",async()=>{
    const {db}=fakeDb(true); provider.sendSms.mockResolvedValue({ok:true,sid:"SMexample",status:"queued"});
    expect(await sendToContact(db,context(),input)).toMatchObject({reason:"delivery_unknown"});
    expect(await sendToContact(db,context(),input)).toMatchObject({reason:"delivery_unknown"});
    expect(provider.calls).toBe(1);
  });
  it("returns a reconciled receipt on accepted retries without contacting the provider",async()=>{
    const {db}=fakeDb(); provider.sendSms.mockResolvedValue({ok:true,sid:"SMexample",status:"queued"});
    expect(await sendToContact(db,context(),input)).toEqual({status:"sent",messageId:"message-1"});
    expect(await sendToContact(db,context(),input)).toEqual({status:"sent",messageId:"message-1"});
    expect(provider.calls).toBe(1);
  });
  it("does not call the provider when the atomic quota reservation fails",async()=>{
    const {db}=fakeDb(false,true);
    expect(await sendToContact(db,context(),input)).toMatchObject({status:"blocked",reason:"monthly_limit_reached"});
    expect(provider.sendSms).not.toHaveBeenCalled();
  });
});
