import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // pdfjs resolves its worker file at runtime; bundling it breaks that lookup in route handlers.
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  // The sample route reads this file at runtime, so the serverless bundle must ship it.
  // The /eval page reads stored eval runs from disk at request time.
  outputFileTracingIncludes: {
    "/api/documents/sample": ["./data/contracts/sample-msa.pdf"],
    "/eval": ["./eval/results/**/*.json"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
