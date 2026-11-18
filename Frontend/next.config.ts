import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is strictly for Docker container builds.
  // On Vercel, Vercel manages serverless lambda packaging natively. Enabling "standalone"
  // breaks Vercel's onBuildComplete step with ENOENT next-server.js.nft.json.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
};

export default nextConfig;

