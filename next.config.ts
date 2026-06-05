import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // postgres (postgres.js) must stay external to the server bundle
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
