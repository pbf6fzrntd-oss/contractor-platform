import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runScheduler } from "@/lib/services/scheduler";
import { GET, POST } from "@/app/api/cron/dispatch/route";
import type { AdminClient } from "@/lib/supabase/admin";

const jobs = vi.hoisted(() => ({ dispatch: vi.fn(), expire: vi.fn(), daily: vi.fn(), cleanup: vi.fn(), report: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/services/outbox", () => ({ runDispatch: jobs.dispatch }));
vi.mock("@/lib/services/booking-maintenance", () => ({ expireStaleBookings: jobs.expire }));
vi.mock("@/lib/services/daily", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/services/daily")>(), runDailyJobs: jobs.daily }));
vi.mock("@/lib/services/demo", () => ({ deleteExpiredDemos: jobs.cleanup }));
vi.mock("@/lib/monitoring/report", () => ({ reportError: jobs.report }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: jobs.admin }));
vi.mock("@/modules/registry", () => ({ MODULES: [] }));
const db = {} as AdminClient;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
  jobs.dispatch.mockResolvedValue({ sent: 2, skipped: 0, deferred: 0, failed: 0 });
  jobs.expire.mockResolvedValue({ unverified: 0, unapproved: 0 });
  jobs.daily.mockResolvedValue({}); jobs.cleanup.mockResolvedValue(0); jobs.admin.mockReturnValue(db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (method: string, authorized = true) => new Request("http://localhost/api/cron/dispatch", {
  method, headers: authorized ? { authorization: "Bearer synthetic-cron-secret" } : {},
});

describe("scheduler failure isolation", () => {
  it("keeps the successful summary and uses one timestamp for all jobs", async () => {
    const now = new Date("2026-10-14T14:00:00Z");
    expect(await runScheduler(db, now)).toEqual({ status: "ok", sent: 2, skipped: 0, deferred: 0, failed: 0, released: { unverified: 0, unapproved: 0 } });
    expect(jobs.dispatch).toHaveBeenCalledWith(db, { now });
    expect(jobs.expire).toHaveBeenCalledWith(db, now);
    expect(jobs.cleanup).toHaveBeenCalledWith(db, now);
  });
  it.each(["dispatch", "expire", "daily", "cleanup"] as const)("continues all independent stages after %s fails", async key => {
    jobs[key].mockRejectedValue(new Error("secret provider details"));
    const result = await runScheduler(db);
    expect(result.status).toBe("partial_failure");
    for (const stage of [jobs.dispatch, jobs.expire, jobs.daily, jobs.cleanup]) expect(stage).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(jobs.report).toHaveBeenCalledOnce();
  });
  it("marks recorded item and daily failures as unhealthy even if no stage throws", async () => {
    jobs.dispatch.mockResolvedValue({ sent: 1, skipped: 0, deferred: 0, failed: 1 });
    jobs.daily.mockResolvedValue({ credential_expiry: { error: "job_failed" } });
    expect(await runScheduler(db)).toMatchObject({ status: "partial_failure", errors: ["dispatch_items", "daily_jobs"] });
  });
  it.each([["GET", GET], ["POST", POST]] as const)("%s returns 503 for partial work, 200 only for success, and 401 without authorization", async (method, handler) => {
    expect((await handler(request(method, false))).status).toBe(401);
    expect(jobs.admin).not.toHaveBeenCalled();
    jobs.dispatch.mockRejectedValueOnce(new Error("offline"));
    const failed = await handler(request(method));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ status: "partial_failure", errors: ["dispatch"] });
    expect((await handler(request(method))).status).toBe(200);
  });
});
