import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: path.resolve(__dirname, "./"),
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@tanstack/react-query"],
  },
};

export default nextConfig;
