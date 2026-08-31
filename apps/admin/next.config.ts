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
        source: "/api/admin/:path*",
        destination: `${serverInternalUrl}/api/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
