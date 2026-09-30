import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReactNode } from "react";
import type { AppContext } from "@/lib/auth/context";
import type { Json } from "@/lib/database.types";
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
  /** Jobs that run once a day from the scheduler (e.g. renewal reminders). They must only touch the module's own businesses. */
  dailyJobs?: ModuleDailyJob[];
  /** Extra sections on a recurring customer's page (team-only screen). */
  customerPanels?: CustomerPanel[];
  /**
   * Fills a freshly built "Try it live" demo business with the module's own
   * records (e.g. agreements and visit reports), from its customers and visits.
   */
  seedDemo?: (db: AdminClient, org: { id: string; name: string; industry: string | null; timezone: string }, now: Date) => Promise<void>;
  /** Buttons on each stop of Today's route (e.g. "Report"). Pure: data in, links out. */
  routeStopLinks?: RouteStopLinks;
};

export type RouteStopLinks = (stop: { recurringServiceId: string; date: string; done: boolean }) => { href: string; label: string }[];

export function moduleRouteStopLinks(all: readonly ModuleManifest[], enabled: readonly string[]): RouteStopLinks[] {
  return activeModules(all, enabled).flatMap((m) => (m.routeStopLinks ? [m.routeStopLinks] : []));
}

export type ModuleDailyJob = { name: string; run: (db: AdminClient, now: Date) => Promise<Json> };

export type CustomerPanel = (props: { ctx: AppContext; contactId: string; recurringServiceId: string | null }) => Promise<ReactNode>;

/** Every module's daily jobs (each job itself only acts on businesses using the module). */
export function moduleDailyJobs(all: readonly ModuleManifest[]): ModuleDailyJob[] {
  return all.flatMap((m) => (m.dailyJobs ?? []).map((j) => ({ ...j, name: `${m.id}_${j.name}` })));
}

export function moduleCustomerPanels(all: readonly ModuleManifest[], enabled: readonly string[]): CustomerPanel[] {
  return activeModules(all, enabled).flatMap((m) => m.customerPanels ?? []);
}

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
