import { describe, expect, it } from "vitest";
import { loadAllReportRows } from "@/lib/services/report-rows";
import { replyRequestIdentity } from "@/lib/messaging/reply-request";
import { loadCoreMetrics, loadRecurringMetrics, loadTrend } from "@/lib/services/metrics";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

describe("complete reporting", () => {
  it("reads more than 5000 rows even when the server caps pages below the requested size", async () => {
    const rows = Array.from({ length: 6201 }, (_, i) => ({ id: String(i).padStart(8, "0") }));
    const loaded = await loadAllReportRows(async cursor => ({ data: rows.filter(r => !cursor || r.id > cursor).slice(0, 117), error: null }));
    expect(loaded).toEqual(rows);
  });
  it("refuses a partial result on a later-page failure", async () => {
    await expect(loadAllReportRows(async cursor => cursor ? { data: null, error: "offline" } : { data: [{ id: "a" }], error: null })).rejects.toThrow("unavailable");
  });
  it("refuses non-progressing rows and null successful responses", async () => {
    await expect(loadAllReportRows(async () => ({ data: [{ id: "a" }], error: null }))).rejects.toThrow("incomplete");
    await expect(loadAllReportRows(async () => ({ data: null, error: null }))).rejects.toThrow("unavailable");
  });
  it("all metric loaders propagate database failures instead of showing zeros", async () => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "or", "lte", "gte", "order", "limit", "gt"]) q[method] = () => q;
    q.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: null, error: "offline" }).then(resolve);
    const db = { from: () => q } as unknown as SupabaseClient<Database>;
    const org = { id: "org", timezone: "America/New_York" };
    for (const loader of [loadCoreMetrics, loadRecurringMetrics, loadTrend]) await expect(loader(db, org)).rejects.toThrow("unavailable");
  });
});

describe("manual reply identity", () => {
  function storage() {
    const values = new Map<string, string>();
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => values.delete(k), values };
  }
  it("reuses a request after reload/lost response without storing the message", async () => {
    const s = storage();
    const first = await replyRequestIdentity(s, "lead-a", "Example private message");
    expect(await replyRequestIdentity(s, "lead-a", " Example private message ")).toEqual(first);
    expect(JSON.stringify([...s.values])).not.toContain("Example private message");
  });
  it("separates conversations and changed drafts, preserving older ambiguous identities", async () => {
    const s = storage(), a = await replyRequestIdentity(s, "lead-a", "First draft");
    expect((await replyRequestIdentity(s, "lead-b", "First draft")).key).not.toBe(a.key);
    expect((await replyRequestIdentity(s, "lead-a", "Changed draft")).key).not.toBe(a.key);
    expect(await replyRequestIdentity(s, "lead-a", "First draft")).toEqual(a);
    s.removeItem(a.storageKey); // Only after acknowledged success.
    expect((await replyRequestIdentity(s, "lead-a", "First draft")).key).not.toBe(a.key);
  });
});
