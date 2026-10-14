import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyJobs } from "@/lib/services/daily";
import { workflowDb } from "../fixtures/workflow-db";
vi.mock("@/lib/monitoring/report", () => ({ reportError: vi.fn() }));
const now = new Date("2026-10-14T14:00:00Z");
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("daily job failure handling", () => {
  it("records failures, continues independent jobs, and does not blindly replay a partially completed job", async () => {
    const f = workflowDb();
    const failed = vi.fn().mockRejectedValue(new Error("secret provider or database details"));
    const later = vi.fn().mockResolvedValue({ queued: 1 });
    const jobs = [{ name: "failed_fixture", run: failed }, { name: "later_fixture", run: later }];
    expect(await runDailyJobs(f.db, now, jobs)).toMatchObject({ failed_fixture: { error: "job_failed" }, later_fixture: { queued: 1 } });
    expect(f.rows("job_runs").find(row => row.job === "failed_fixture")?.result).toEqual({ error: "job_failed" });
    expect(await runDailyJobs(f.db, now, jobs)).toEqual({ failed_fixture: { error: "previous_run_failed" } });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("reports a claim failure and still attempts later jobs", async () => {
    const f = workflowDb();
    f.failNext("job_runs", "upsert");
    const later = vi.fn().mockResolvedValue({ ok: true });
    const result = await runDailyJobs(f.db, now, [{ name: "later_fixture", run: later }]);
    expect(result.credential_expiry).toEqual({ error: "job_tracking_failed" });
    expect(later).toHaveBeenCalledOnce();
    // A claim never acquired is safe to try again on the next tick.
    expect(await runDailyJobs(f.db, now)).toEqual({ credential_expiry: { alerted: 0 } });
  });

  it("reports failed reads instead of an empty successful job", async () => {
    const f = workflowDb();
    f.failNext("business_credentials");
    expect(await runDailyJobs(f.db, now)).toMatchObject({ credential_expiry: { error: "job_failed" }, vaccine_expiry: { queued: 0 } });
  });

  it("reports a failed result write and later exposes the incomplete run without replaying it", async () => {
    const f = workflowDb();
    f.failNext("job_runs", "update");
    expect(await runDailyJobs(f.db, now)).toMatchObject({ credential_expiry: { error: "job_tracking_failed" } });
    expect(await runDailyJobs(f.db, new Date("2026-10-14T14:10:00Z"))).toEqual({ credential_expiry: { error: "incomplete_run" } });
  });

  it("does not flag a recent in-progress claim or run jobs before the daily window", async () => {
    const f = workflowDb({ job_runs: [{ job: "credential_expiry", run_on: "2026-10-14", ran_at: now.toISOString(), result: null }] });
    expect(await runDailyJobs(f.db, new Date("2026-10-14T11:59:00Z"))).toEqual({});
    expect(await runDailyJobs(f.db, now)).not.toHaveProperty("credential_expiry");
  });
});
