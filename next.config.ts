import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.2.16.207", "*.trycloudflare.com"],
  experimental: {
    agentUpgrade: "security",
  },
}

export default nextConfig
