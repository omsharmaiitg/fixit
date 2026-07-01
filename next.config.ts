import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin workspace root: a stray ~/package-lock.json otherwise misplaces the
  // standalone server.js under .next/standalone/fixit/ and breaks the Docker CMD.
  turbopack: { root: path.resolve() },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Mock photos for seeded demo issues (Seed Shamli demo data).
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
