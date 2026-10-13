import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Avoid Next picking up a lockfile outside this repo as the workspace root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
