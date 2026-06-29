import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin workspace root: a stray ~/package-lock.json otherwise misplaces the
  // standalone server.js under .next/standalone/fixit/ and breaks the Docker CMD.
  turbopack: { root: path.resolve() },
};

export default nextConfig;
