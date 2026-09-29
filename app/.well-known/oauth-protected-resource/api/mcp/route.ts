import { corsPreflight, json, protectedResourceMetadata } from "@/lib/agent/oauth-metadata";

export const dynamic = "force-dynamic";
export const GET = () => json(protectedResourceMetadata());
export const OPTIONS = corsPreflight;
