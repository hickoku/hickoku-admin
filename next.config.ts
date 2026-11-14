import type { NextConfig } from "next";

// Exposed to the browser only so the sidebar can show which data you're on.
// Must match lib/env.ts.
const APP_ENV =
  process.env.APP_ENV === "prod" || process.env.APP_ENV === "stage"
    ? process.env.APP_ENV
    : process.env.NODE_ENV === "production"
      ? "prod"
      : "stage";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_ENV: APP_ENV },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
