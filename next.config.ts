import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo and document uploads (4 MB max, see lib/files/validate.ts) plus form overhead.
    // Vercel caps any request at 4.5 MB, so don't raise this.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
