import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildPublicAgentServer } from "@/lib/agent/public-server";
import { CORS_HEADERS, corsPreflight } from "@/lib/agent/oauth-metadata";
import { publicEnv } from "@/lib/env";
import { modulePublicAgentTools } from "@/lib/modules/types";
import { modulesOrDefault } from "@/lib/modules/defaults";
import { allowPublicRequest, visitorHash } from "@/lib/public/rate-limit";
import { loadPublicBusiness } from "@/lib/services/public-booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULES } from "@/modules/registry";

/**
 * Public MCP connection for customers' AI agents, one per business:
 * /api/agent/<slug>. No key: it only exposes public facts and booking requests.
 */
export const maxDuration = 60;

const error = (status: number, message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers: CORS_HEADERS });

async function handle(request: Request, { params }: RouteContext<"/api/agent/[slug]">): Promise<Response> {
  const { slug } = await params;
  const db = createAdminClient();
  const biz = await loadPublicBusiness(db, slug.toLowerCase());
  if (!biz) return error(404, "No public booking for this business.");
  const ipHash = visitorHash(request.headers);
  if (!(await allowPublicRequest(db, biz.org.id, ipHash, "lookup"))) return error(429, "Too many requests. Wait a few minutes.");
  const { data: rows } = await db.from("org_modules").select("module").eq("org_id", biz.org.id).eq("enabled", true);

  const server = buildPublicAgentServer(
    { db, biz, ipHash, bookingUrl: biz.profile.booking_available ? `${publicEnv.siteUrl}/b/${biz.profile.slug}/book` : null },
    modulePublicAgentTools(MODULES, modulesOrDefault(rows)),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(request);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  } finally {
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = corsPreflight;
