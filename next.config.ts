import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.2.16.207", "*.trycloudflare.com"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://127.0.0.1:4000"}/api/:path*`,
      },
    ];
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
