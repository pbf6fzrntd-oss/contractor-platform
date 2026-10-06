import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  experimental: {
    // Photo and document uploads (4 MB max, see lib/files/validate.ts) plus form overhead.
    // Vercel caps any request at 4.5 MB, so don't raise this.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
