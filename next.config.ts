import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas'],
  outputFileTracingIncludes: {
    "/api/sponsors": ["data/sponsors/*.csv"],
    "/api/companies/*": ["data/sponsors/*.csv"],
    "/api/jobs/*": ["data/sponsors/*.csv"],
  },
};

export default nextConfig;
