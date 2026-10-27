import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(async () => false),
}))
import path from "node:path"
import { REPORTS } from "../report-registry"
import { REPORT_CATALOG_HREFS } from "../report-catalog"

/**
 * Paritas registry PDF ↔ halaman laporan, BERARAH DUA.
 *
 * - Setiap href di katalog laporan WAJIB punya kunci PDF di REPORTS (kalau
 *   tidak, tombol PDF halaman itu tidak bisa memakai pipeline `/api/pdf`).
 * - Setiap kunci REPORTS WAJIB dipakai halaman laporannya lewat
 *   `buildReportPdfHref("<kunci>"` (kalau tidak, entri registry mati — tidak
 *   ada tombol yang memanggilnya).
 *
 * Kunci = segmen terakhir href (`/laporan/mutasi-stok` → `mutasi-stok`),
 * kecuali `laba-rugi-per-pusat-biaya` yang kunci PDF-nya `laba-rugi-pusat-biaya`
 * (nama historis — lihat pemakaian `buildReportPdfHref` di halamannya).
 */

const reportsDir = path.resolve(__dirname, "../../../app/(dashboard)/laporan")

const KEY_OVERRIDES: Record<string, string> = {
  "laba-rugi-per-pusat-biaya": "laba-rugi-pusat-biaya",
  // Halaman /laporan/pajak menampilkan read-model SPT; ekspornya memakai
  // kunci `posisi-spt` (builder sama), bukan kunci pajak rincian dokumen.
  pajak: "posisi-spt",
}

function hrefToKey(href: string): string {
  const slug = href.replace("/laporan/", "")
  return KEY_OVERRIDES[slug] ?? slug
}

function pageSources(): { href: string; source: string }[] {
  const componentSources: Record<string, string> = {}
  try {
    componentSources["/laporan/buku-pembantu-piutang"] = readFileSync(
      path.join(reportsDir, "_components", "subledger-report.tsx"),
      "utf8",
    )
    componentSources["/laporan/buku-pembantu-utang"] =
      componentSources["/laporan/buku-pembantu-piutang"]
    // Halaman tipis mendelegasikan tombol PDF ke komponen laporan bersama.
    const sharedDir = path.resolve(__dirname, "../../../components/reports")
    componentSources["/laporan/hutang-jatuh-tempo"] = readFileSync(path.join(sharedDir, "aging-report-view.tsx"), "utf8")
    componentSources["/laporan/piutang-jatuh-tempo"] = componentSources["/laporan/hutang-jatuh-tempo"]
    componentSources["/laporan/laba-rugi-terealisasi"] = readFileSync(path.join(sharedDir, "income-statement-page.tsx"), "utf8")
    componentSources["/laporan/laba-rugi-tidak-terealisasi"] = componentSources["/laporan/laba-rugi-terealisasi"]
  } catch {
    // Halaman membaca langsung; abaikan bila komponen tidak ada.
  }
  return REPORT_CATALOG_HREFS.map((href) => {
    if (componentSources[href]) return { href, source: componentSources[href] }
    const slug = href.replace("/laporan/", "")
    const candidates = [
      path.join(reportsDir, slug, "[[...segments]]", "page.tsx"),
      path.join(reportsDir, slug, "page.tsx"),
    ]
    for (const file of candidates) {
      try {
        return { href, source: readFileSync(file, "utf8") }
      } catch {
        continue
      }
    }
    return { href, source: "" }
  })
}

describe("paritas registry PDF laporan", () => {
  it("setiap laporan di katalog punya kunci PDF di REPORTS", () => {
    // Laporan tanpa PDF server-side (grafik murni, proyeksi, multi-periode):
    // tombolnya tetap cetak/CSV, bukan pipeline /api/pdf.
    const TANPA_PDF = [
      "analisis-harga-beli",
      // F-094-S: ekspor/PDF antrean garansi ditolak tahap 1 (BR-WX-06/Q-WX-3).
      "garansi-segera-berakhir",
      // F-095-S BR-SUPP-11: daftar aging klaim supplier baca-saja tahap 1,
      // tanpa ekspor/PDF (pola garansi-segera-berakhir).
      "aging-klaim-supplier",
      // F-2026-10-25-021-S: antrean pengingat servis berkala baca-saja;
      // ekspor/PDF server-side belum dibuka (pola garansi-segera-berakhir).
      "servis-berkala",
      "corong-prospek",
      "grafik-keuangan",
      "giro-mundur",
      "harga-pemasok",
      "margin-kendaraan",
      "multi-periode",
      "nomor-seri-batch",
      "perbandingan-periode",
      "perbedaan-penyusutan",
      "pajak-tangguhan",
      "rekonsiliasi-aset",
      "proyeksi-kas",
      "pusat-laba",
      "rekap-komisi",
      // F-2026-10-25-037-S §5: saldo utang komisi baca-saja; PDF server-side
      // belum dibuka (pola rekap-komisi; angka ekspor wajib builder yang
      // sama dengan layar bila nanti dibuka).
      "saldo-utang-komisi",
      // F-039-S BR-QPH-09: riwayat harga penawaran baca-saja tahap 1;
      // ekspor/PDF server-side belum dibuka (angka ekspor wajib builder
      // yang sama dengan layar bila nanti dibuka).
      "riwayat-harga-penawaran",
      // F-2026-10-25-028-S: riwayat harga jual baca-saja tahap 1;
      // ekspor/PDF server-side belum dibuka (pola 039-S BR-QPH-09).
      "riwayat-harga-jual",
      "target-penjualan",
      "serapan-overhead",
    ]
    const hilang = REPORT_CATALOG_HREFS.map(hrefToKey).filter((key) => !(key in REPORTS) && !TANPA_PDF.includes(key))
    expect(hilang).toEqual([])
  })

  it("setiap kunci REPORTS dipakai halaman laporannya (tidak ada entri mati)", () => {
    const pages = pageSources()
    const mati = Object.keys(REPORTS).filter((key) => {
      const page = pages.find((p) => hrefToKey(p.href) === key)
      if (!page || !page.source) return true
      // Kunci dinamis `isAr ? "kunci-ar" : "kunci-ap"` tetap menyebut kedua literal.
      return !page.source.includes(`"${key}"`)
    })
    expect(mati).toEqual([])
  })

  it("memindai katalog nyata (penjaga tes itu sendiri)", () => {
    expect(REPORT_CATALOG_HREFS.length).toBeGreaterThan(40)
    expect(Object.keys(REPORTS).length).toBeGreaterThan(40)
  })
})

describe("halaman laporan memakai tombol PDF server-side", () => {
  it("20 halaman cakupan memakai buildReportPdfHref (bukan window.print saja)", () => {
    // Hanya halaman yang kunci PDF-nya sudah terdaftar; sisanya tetap
    // cetak/CSV sampai giliran didaftarkan (lihat TANPA_PDF di atas).
    const pages = pageSources().filter((p) => hrefToKey(p.href) in REPORTS)
    expect(pages.length).toBeGreaterThan(40)
    const tanpaPdf = pages
      .filter((p) => p.source && !p.source.includes("buildReportPdfHref("))
      .map((p) => p.href)
    expect(tanpaPdf).toEqual([])
  })
})
