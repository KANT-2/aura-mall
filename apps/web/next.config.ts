import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const monorepoRoot = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
  allowedDevOrigins: ["127.0.0.1", "10.2.16.207", "*.trycloudflare.com"],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
