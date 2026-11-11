import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Proxy API to the backend during development */
  async rewrites() {
    const backend = process.env.FINN_BACKEND_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
