import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, "./"),
  images: {
    formats: ["image/avif", "image/webp"],
    // Allow Next/Image optimization for known CDNs. SafeImage falls back to
    // plain <img> for anything not in this list. Add your CDN host here to
    // get auto WebP/AVIF, lazy loading, and CLS prevention.
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@tanstack/react-query"],
  },
};

export default nextConfig;
