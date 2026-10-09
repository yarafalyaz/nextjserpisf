import type { NextConfig } from "next";
import path from "node:path";

// Dev and the production build must not share `.next`: `next dev` keeps a
// Turbopack cache under `.next/dev`, and a host `next build` writes
// build-manifest/BUILD_ID over it. Interleaving the two corrupts the cache
// ("failed to open ...sst: No such file or directory") and every route 500s.
// In the dev Docker container `.next` is the host bind, so a build run from the
// host would clobber the running dev cache — keep dev on its own distDir.
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  ...(isDev ? { distDir: ".next-dev" } : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, "./"),
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          // Strict-Transport-Security is NOT set here: a static header would also
          // be sent over plain HTTP (this file cannot see the request scheme).
          // src/proxy.ts sets it only when the request actually arrived over TLS.
        ],
      },
    ];
  },

  compress: true,

  // Legacy: the vendor master lived at /master/pemasok; the app now uses the
  // one consistent term "vendor". 301 the old URLs (list, detail, add, edit —
  // any nested path) so bookmarks and old links keep working.
  async redirects() {
    return [
      {
        source: "/master/pemasok",
        destination: "/master/vendor",
        permanent: true,
      },
      {
        source: "/master/pemasok/:path*",
        destination: "/master/vendor/:path*",
        permanent: true,
      },
      // Anggaran laporan pernah punya dua halaman nyaris identik
      // (anggaran-vs-aktual & anggaran-vs-realisasi). Yang resmi adalah
      // anggaran-vs-realisasi (punya filter Pusat Biaya); URL lama diarahkan
      // ke sana agar bookmark lama tetap berfungsi.
      {
        source: "/laporan/anggaran-vs-aktual",
        destination: "/laporan/anggaran-vs-realisasi",
        permanent: true,
      },
    ];
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "@tanstack/react-query"],
  },
};

export default nextConfig;
