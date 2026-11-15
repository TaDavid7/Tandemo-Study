import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Where /api requests are forwarded. API_PROXY_URL overrides it (Docker sets it to
  // http://backend:5000). Unset in a production build means no proxy: AWS routes /api.
  // Rewrites are baked in at `next build`, so set it at build time.
  async rewrites() {
    const isProd = process.env.NODE_ENV === "production";
    const apiProxy = process.env.API_PROXY_URL || (isProd ? "" : "http://localhost:5000");
    return apiProxy
      ? [{ source: "/api/:path*", destination: `${apiProxy}/api/:path*` }]
      : [];
  },
};

export default nextConfig;
