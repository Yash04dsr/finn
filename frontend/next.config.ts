import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gzip buffers the proxied /api/chat event stream until it ends, which hides
  // every progress step. The hosting edge compresses static assets anyway.
  compress: false,
  /* Proxy API to the backend during development */
  async rewrites() {
    const backend = process.env.FINN_BACKEND_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
