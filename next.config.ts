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
  env: {
    NEXT_PUBLIC_APP_ENV: APP_ENV,
    // Existing product images are paths inside the storefront (e.g.
    // /hickoku-assets/velvira/Velvira1.JPG); the admin shows them from here.
    NEXT_PUBLIC_STOREFRONT_URL: process.env.STOREFRONT_URL || "https://www.hickoku.com",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
