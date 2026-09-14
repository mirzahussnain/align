import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/sponsors": ["data/sponsors/*.csv"],
    "/api/companies/*": ["data/sponsors/*.csv"],
    "/api/jobs/*": ["data/sponsors/*.csv"],
  },
};

export default nextConfig;
