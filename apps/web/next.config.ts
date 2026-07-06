import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pacotes internos do monorepo que exportam TS cru — o Next transpila.
  transpilePackages: ["@stalo/server", "@stalo/shared"],
};

export default nextConfig;
