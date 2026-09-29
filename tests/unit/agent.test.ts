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

import {
  accessAllows,
  accessFromScope,
  isAllowedRedirectUri,
  pkceChallenge,
  verifyPkce,
} from "@/lib/agent/oauth";

describe("one-tap connect (OAuth) rules", () => {
  it("matches the PKCE example from the OAuth standard (RFC 7636)", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(verifyPkce(verifier, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
  });

  it("rejects a wrong, missing or too-short verifier", () => {
    expect(verifyPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
    expect(verifyPkce(null, "x")).toBe(false);
    expect(verifyPkce("short", pkceChallenge("short"))).toBe(false);
  });

  it("only sends owners back to https or their own computer", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://ok.example.com/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });

  it("orders access levels", () => {
    expect(accessAllows("full", "read_write")).toBe(true);
    expect(accessAllows("read_write", "full")).toBe(false);
    expect(accessAllows("read", "read")).toBe(true);
    expect(accessAllows("bogus", "read")).toBe(false);
  });

  it("reads the level an app asks for, defaulting to day-to-day work", () => {
    expect(accessFromScope("full")).toBe("full");
    expect(accessFromScope("read")).toBe("read");
    expect(accessFromScope(undefined)).toBe("read_write");
    expect(accessFromScope("openid read_write")).toBe("read_write");
  });
});
