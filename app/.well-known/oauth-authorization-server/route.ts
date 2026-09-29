import { authorizationServerMetadata, corsPreflight, json } from "@/lib/agent/oauth-metadata";

export const dynamic = "force-dynamic";
export const GET = () => json(authorizationServerMetadata());
export const OPTIONS = corsPreflight;
