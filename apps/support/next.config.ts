import path from "node:path";
import type { NextConfig } from "next";

const serverInternalUrl =
  process.env.SERVER_INTERNAL_URL ??
  process.env.API_INTERNAL_URL ??
  "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/public/:path*",
        destination: `${serverInternalUrl}/api/public/:path*`,
      },
      {
        source: "/api/integrations/:path*",
        destination: `${serverInternalUrl}/api/integrations/:path*`,
      },
      {
        source: "/api/health",
        destination: `${serverInternalUrl}/api/health`,
      },
    ];
  },
};

export default nextConfig;
