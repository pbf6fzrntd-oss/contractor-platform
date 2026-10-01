import { describe, expect, it, vi } from "vitest";
import { runDispatch } from "@/lib/services/outbox";
import type { AdminClient } from "@/lib/supabase/admin";

describe("unified dispatch claims", () => {
  it.each([
    {}, { fastForwardOrgId: "org" }, { fastForwardOrgId: "org", dueOnly: true },
    { broadcastId: "broadcast" }, { scheduledIds: ["one", "two"] }, { scheduledIds: [] },
  ])("processes only atomic claims for %j", async options => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn(() => { throw new Error("Unclaimed query"); });
    expect(await runDispatch({ rpc, from } as unknown as AdminClient, options)).toEqual({ sent: 0, failed: 0, skipped: 0, deferred: 0 });
    expect(rpc).toHaveBeenCalledWith("claim_scheduled_messages", expect.objectContaining({
      p_org_id: options.fastForwardOrgId, p_broadcast_id: options.broadcastId, p_ids: options.scheduledIds,
      p_fast_forward: Boolean(options.fastForwardOrgId && !options.dueOnly),
    }));
    expect(from).not.toHaveBeenCalled();
  });
  it("fails before processing when claiming fails", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("claim failed") }), from: vi.fn() };
    await expect(runDispatch(db as unknown as AdminClient)).rejects.toThrow("claim failed");
    expect(db.from).not.toHaveBeenCalled();
  });
});
