import { ACCESS_LEVELS } from "@/lib/agent/oauth";
import { publicEnv } from "@/lib/env-public";

/** Lets AI apps call our sign-in endpoints from anywhere (they're protected by PKCE, not by origin). */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export const corsPreflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra } });
}

/** RFC 9728: tells an AI app where to sign in for /api/mcp. */
export function protectedResourceMetadata() {
  const site = publicEnv.siteUrl;
  return {
    resource: `${site}/api/mcp`,
    authorization_servers: [site],
    bearer_methods_supported: ["header"],
    scopes_supported: [...ACCESS_LEVELS],
    resource_name: "Lowcountry Leads",
  };
}

/** RFC 8414: our sign-in endpoints. */
export function authorizationServerMetadata() {
  const site = publicEnv.siteUrl;
  return {
    issuer: site,
    authorization_endpoint: `${site}/oauth/authorize`,
    token_endpoint: `${site}/api/oauth/token`,
    registration_endpoint: `${site}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...ACCESS_LEVELS],
  };
}

export const resourceMetadataUrl = () => `${publicEnv.siteUrl}/.well-known/oauth-protected-resource`;
