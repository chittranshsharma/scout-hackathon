import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin workspace root (a parent lockfile exists) to silence inference warning.
  turbopack: { root: path.resolve(process.cwd()) },
  // Keep react-pdf out of the bundler — it relies on Node internals at runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
