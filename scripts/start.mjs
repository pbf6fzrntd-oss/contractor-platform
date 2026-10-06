/** Run the same standalone artifact used by the container on any Node host. */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const server = resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("Production build missing. Run npm run build before npm start.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: process.env.APP_HOSTNAME || "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Unable to start the production server."); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
});
