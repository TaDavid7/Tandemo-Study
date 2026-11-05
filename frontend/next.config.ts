import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const isProd = process.env.NODE_ENV === "production";
    return isProd
      ? [] // AWS handles /api routing in prod
      : [
          {
            source: "/api/:path*",
            destination: "http://localhost:5000/api/:path*", // proxy for local dev
          },
        ];
  },

  
};

export default nextConfig;
