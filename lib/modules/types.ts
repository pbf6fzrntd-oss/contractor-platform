import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentContext } from "@/lib/agent/server";
import type { ModuleId } from "@/lib/industries/types";
import type { NavEntry } from "@/lib/navigation";
import type { Org } from "@/lib/org";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The contract every module (feature package in /modules) fills in.
 *
 * The core never imports module code. Instead, modules/registry.ts lists the
 * modules, and app/ code passes the registry into the core helpers below.
 * A business only gets a module's menus and tools when its org_modules row is
 * enabled, so turning a module on or off is a settings change, not a code change.
 */

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Helpers a module uses to add AI assistant tools that behave like core ones (logged, same result shape). */
export type AgentToolHelpers = {
  logged: <A>(tool: string, handler: (args: A) => Promise<{ result: ToolResult; summary: string }>) => (args: A) => Promise<ToolResult>;
  ok: (data: unknown) => ToolResult;
  fail: (message: string) => ToolResult;
};

export type AgentToolRegistrar = (server: McpServer, ctx: AgentContext, helpers: AgentToolHelpers) => void;

/** Public tools only get the business and database access; they must return public facts only. */
export type PublicAgentToolRegistrar = (
  server: McpServer,
  ctx: { db: AdminClient; org: Org },
  helpers: Pick<AgentToolHelpers, "ok" | "fail">,
) => void;

export type ModuleManifest = {
  id: ModuleId;
  name: string;
  description: string;
  /** Industry keys (lib/industries) this module serves. */
  industries: string[];
  /** Extra bottom-bar / More menu items. */
  navItems?: NavEntry[];
  /** Tools for the business's own AI assistants (owner/manager). Check ctx.access inside. */
  ownerAgentTools?: AgentToolRegistrar;
  /**
   * Tools for customers' AI agents on the PUBLIC connection (e.g. pet care's
   * vaccine requirements, automotive's price by vehicle size). Must return
   * only public facts: never customers, private notes, codes, VINs or files.
   */
  publicAgentTools?: PublicAgentToolRegistrar;
};

/** The modules a business has switched on, in registry order. */
export function activeModules(all: readonly ModuleManifest[], enabled: readonly string[]): ModuleManifest[] {
  return all.filter((m) => enabled.includes(m.id));
}

export function moduleNavEntries(all: readonly ModuleManifest[], enabled: readonly string[]): NavEntry[] {
  return activeModules(all, enabled).flatMap((m) => m.navItems ?? []);
}

export function modulePublicAgentTools(all: readonly ModuleManifest[], enabled: readonly string[]): PublicAgentToolRegistrar[] {
  return activeModules(all, enabled).flatMap((m) => (m.publicAgentTools ? [m.publicAgentTools] : []));
}

export function moduleAgentTools(all: readonly ModuleManifest[], enabled: readonly string[]): AgentToolRegistrar[] {
  return activeModules(all, enabled).flatMap((m) => (m.ownerAgentTools ? [m.ownerAgentTools] : []));
}
