import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "YaraERP - ERP Bengkel & Fabrikasi",
    short_name: "YaraERP",
    description: "Sistem ERP terintegrasi untuk manajemen bengkel, fabrikasi, inventaris, SDM, dan keuangan",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dasbor",
        short_name: "Dasbor",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Kalender",
        short_name: "Kalender",
        url: "/kalender",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Scan Barang",
        short_name: "Scan",
        url: "/inventaris/scan",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Proyek",
        short_name: "Proyek",
        url: "/proyek",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  }
}
