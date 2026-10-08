import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// API_INTERNAL_URL may arrive without a scheme from host wiring
// (e.g. Render's host:port service references) — normalize it.
const rawApiUrl = process.env.API_INTERNAL_URL ?? "localhost:8010";
const API_URL = rawApiUrl.startsWith("http") ? rawApiUrl : `http://${rawApiUrl}`;

const nextConfig: NextConfig = {
  // Silence "workspace root" warning when a stray lockfile exists in %USERPROFILE%
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    // Same-origin proxy: the browser only ever talks to localhost:3000.
    // Cookies stay first-party, and CORS is not needed in dev.
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/media/:path*", destination: `${API_URL}/media/:path*` },
      { source: "/health", destination: `${API_URL}/health` },
    ];
  },
};

export default nextConfig;
