import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAgent } from "@/lib/agent/auth";
import { buildAgentServer } from "@/lib/agent/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AI assistant access (MCP, "Model Context Protocol").
 * Assistants like Claude or ChatGPT connect here with a business's key
 * (Settings → AI assistants) and can then use the tools in lib/agent/server.ts.
 * Stateless: every request is checked and handled on its own.
 */
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  const db = createAdminClient();
  const auth = await authenticateAgent(db, request.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.message }, id: null },
      { status: auth.status, headers: auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="lowcountry-leads"' } : {} },
    );
  }

  const server = buildAgentServer(auth.ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Responses are complete JSON (no streaming), so it's safe to clean up.
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
