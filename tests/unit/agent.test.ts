import { describe, expect, it } from "vitest";
import { resolveDay } from "@/lib/agent/dates";
import { generateApiKey, hashApiKey, keyFromAuthHeader } from "@/lib/agent/keys";

const TUE = "2026-09-29";

describe("dates an assistant might say", () => {
  it.each([
    [undefined, TUE],
    ["today", TUE],
    ["Tomorrow", "2026-09-30"],
    ["2026-10-02", "2026-10-02"],
    ["thursday", "2026-10-01"],
    ["Thu", "2026-10-01"],
    ["tuesday", TUE],
  ])("%s -> %s", (input, expected) => {
    expect(resolveDay(input, TUE)).toBe(expected);
  });

  it("treats a weekday as the next one when moving a visit", () => {
    expect(resolveDay("tuesday", TUE, { after: true })).toBe("2026-10-06");
    expect(resolveDay("thursday", TUE, { after: true })).toBe("2026-10-01");
  });

  it("rejects dates that don't make sense", () => {
    expect(resolveDay("someday", TUE)).toBeNull();
    expect(resolveDay("2026-02-30", TUE)).toBeNull();
    expect(resolveDay("today", TUE, { after: true })).toBeNull();
    expect(resolveDay("2026-09-28", TUE, { after: true })).toBeNull();
  });
});

describe("assistant keys", () => {
  it("creates unique keys and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^llk_[A-Za-z0-9_-]{32}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key);
    expect(a.prefix).toBe(a.key.slice(0, 10));
  });

  it("reads only well-formed bearer keys", () => {
    expect(keyFromAuthHeader("Bearer llk_abc")).toBe("llk_abc");
    expect(keyFromAuthHeader("bearer llk_abc")).toBe("llk_abc");
    expect(keyFromAuthHeader("Bearer sk_other")).toBeNull();
    expect(keyFromAuthHeader(null)).toBeNull();
    expect(keyFromAuthHeader("llk_abc")).toBeNull();
  });
});
