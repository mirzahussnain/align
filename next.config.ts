import type { NextConfig } from "next";

const pdfJsRuntimeAssets = [
  "node_modules/pdfjs-dist/standard_fonts/**/*",
  "node_modules/pdfjs-dist/cmaps/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'unpdf', 'pdfjs-dist'],
  outputFileTracingIncludes: {
    "/api/sponsors": ["data/sponsors/*.csv"],
    "/api/companies/*": ["data/sponsors/*.csv"],
    "/api/jobs/*": ["data/sponsors/*.csv"],
    "/api/cv-generations/*/generate": pdfJsRuntimeAssets,
    "/api/cv/*/preview": pdfJsRuntimeAssets,
  },
};

export default nextConfig;
