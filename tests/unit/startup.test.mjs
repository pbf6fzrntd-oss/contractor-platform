import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const launcher = resolve("scripts/start.mjs");
describe("portable standalone startup", () => {
  it("loads root env files, preserves host secrets and copies static assets before starting", () => {
    const root = mkdtempSync(join(tmpdir(), "lowcountry-startup-"));
    try {
      mkdirSync(join(root, ".next/standalone"), { recursive: true });
      mkdirSync(join(root, ".next/static"), { recursive: true });
      writeFileSync(join(root, ".next/static/fixture.css"), "fixture");
      writeFileSync(join(root, ".env.local"), "SUPABASE_SECRET_KEY=fixture-server-secret\nCRON_SECRET=file-fixture\n");
      writeFileSync(join(root, ".next/standalone/server.js"), `
        const fs = require('node:fs');
        console.log(JSON.stringify({
          secretLoaded: process.env.SUPABASE_SECRET_KEY === 'fixture-server-secret',
          hostPreserved: process.env.CRON_SECRET === 'runtime-fixture',
          assetsCopied: fs.existsSync(__dirname + '/.next/static/fixture.css'),
          hostname: process.env.HOSTNAME
        }));
      `);
      const env = { ...process.env, NODE_ENV: "production", CRON_SECRET: "runtime-fixture", APP_HOSTNAME: "127.0.0.1" };
      delete env.SUPABASE_SECRET_KEY;
      const result = spawnSync(process.execPath, [launcher], { cwd: root, env, encoding: "utf8", timeout: 10000 });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toEqual({ secretLoaded: true, hostPreserved: true, assetsCopied: true, hostname: "127.0.0.1" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("fails clearly when the production artifact has not been built", () => {
    const root = mkdtempSync(join(tmpdir(), "lowcountry-startup-"));
    try {
      const result = spawnSync(process.execPath, [launcher], { cwd: root, encoding: "utf8", timeout: 10000 });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Run npm run build before npm start");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
