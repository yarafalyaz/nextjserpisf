import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

import { navigation } from "@/components/layout/navigation"
import { NAV_CARD_DESCRIPTIONS } from "@/components/layout/nav-descriptions"
import {
  REPORT_CATEGORIES,
  REPORT_CATALOG_HREFS,
  catalogLabel,
} from "@/lib/reports/report-catalog"

/**
 * Katalog `/laporan` = daftar per kategori bergaya Accurate, dengan nama laporan
 * berbentuk **Keluarga (Varian)** ("Laba Rugi (Standar)", "Buku Besar (Bank)").
 *
 * Katalog menyusun ulang laporan yang sudah ada di navigasi, jadi penjaga ini
 * memastikan: tidak ada laporan yang hilang/terdaftar dua kali, tidak ada href
 * karangan, tidak ada keluarga yang tidak dikenal menu, dan laporan baru yang
 * ditambahkan ke navigasi memaksa kategorinya ikut diisi (tes gagal sampai diisi).
 */
const ROOT = process.cwd()
const REPORTS_DIR = path.join(ROOT, "src/app/(dashboard)/laporan")

/** Halaman yang bukan laporan: katalognya sendiri dan redirect lama. */
const EXEMPT = ["keuangan/page.tsx", "page.tsx"]

function reportPages(dir: string, rel = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      // Nama folder catch-all tidak membentuk URL, jadi tidak ikut jadi href.
      return reportPages(path.join(dir, entry.name), entry.name === "[[...segments]]" ? rel : next)
    }
    return entry.name === "page.tsx" && rel ? [next] : []
  })
}

const NAV_REPORTS = navigation.find((item) => item.href === "/laporan")?.children ?? []
const MENU_LABEL = new Map(NAV_REPORTS.map((child) => [child.href, child.label]))

describe("katalog laporan", () => {
  it("setiap laporan di navigasi masuk tepat satu kategori", () => {
    expect([...REPORT_CATALOG_HREFS].sort()).toEqual(NAV_REPORTS.map((c) => c.href).sort())
    expect(new Set(REPORT_CATALOG_HREFS).size).toBe(REPORT_CATALOG_HREFS.length)
  })

  it("setiap halaman laporan di disk ada di katalog", () => {
    const onDisk = reportPages(REPORTS_DIR)
      .filter((rel) => !EXEMPT.includes(rel))
      .map((rel) => `/laporan/${rel.replace(/\/page\.tsx$/, "")}`)
      .sort()
    expect(onDisk).toEqual([...REPORT_CATALOG_HREFS].sort())
  })

  it("setiap laporan punya deskripsi bergaya 'Menampilkan …'", () => {
    const kurang: string[] = []
    for (const href of REPORT_CATALOG_HREFS) {
      const desc = NAV_CARD_DESCRIPTIONS[href]
      if (!desc) kurang.push(`${href} (tanpa deskripsi)`)
      else if (!desc.startsWith("Menampilkan ")) kurang.push(`${href} (bukan gaya katalog)`)
    }
    expect(kurang).toEqual([])
  })

  it("kategori punya kunci unik dan tidak kosong", () => {
    const keys = REPORT_CATEGORIES.map((category) => category.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(REPORT_CATEGORIES.filter((category) => category.reports.length === 0)).toEqual([])
  })

  it("keluarga berisi minimal dua varian dan anggotanya berurutan", () => {
    const masalah: string[] = []
    for (const category of REPORT_CATEGORIES) {
      const families = new Map<string, string[]>()
      let previous = ""
      for (const report of category.reports) {
        const family = report.family ?? `__sendiri__${report.href}`
        if (!families.has(family)) families.set(family, [])
        families.get(family)!.push(report.href)
        // Anggota satu keluarga harus berdampingan; kalau terselip laporan lain,
        // katalognya kembali terbaca sebagai daftar acak.
        if (report.family && report.family !== previous && families.get(family)!.length > 1) {
          masalah.push(`${category.key}: ${family} terputus oleh laporan lain`)
        }
        previous = report.family ?? ""
      }
      for (const [family, hrefs] of families) {
        if (family.startsWith("__sendiri__")) continue
        if (hrefs.length < 2) masalah.push(`${category.key}: keluarga "${family}" hanya punya ${hrefs.length} varian`)
      }
    }
    expect(masalah).toEqual([])
  })

  it("nama keluarga berasal dari label menu, bukan karangan", () => {
    const masalah: string[] = []
    for (const category of REPORT_CATEGORIES) {
      const families = new Set(
        category.reports.map((report) => report.family).filter((family) => family !== undefined),
      )
      for (const family of families) {
        const cocok = category.reports.some(
          (report) => report.family === family && (MENU_LABEL.get(report.href) ?? "").startsWith(family),
        )
        if (!cocok) masalah.push(`${category.key}: "${family}" bukan awalan label menu anggotanya`)
      }
    }
    expect(masalah).toEqual([])
  })

  it("label tampil = 'Keluarga (Varian)' untuk laporan bervarian, label menu untuk laporan tunggal", () => {
    const masalah: string[] = []
    for (const category of REPORT_CATEGORIES) {
      for (const report of category.reports) {
        const menuLabel = MENU_LABEL.get(report.href)
        if (!menuLabel) continue
        const shown = catalogLabel(report, menuLabel)
        if (report.family) {
          if (shown !== `${report.family} (${report.variant})`) masalah.push(`${report.href} → ${shown}`)
        } else if (shown !== menuLabel) {
          masalah.push(`${report.href} → ${shown} (seharusnya "${menuLabel}")`)
        }
      }
    }
    expect(masalah).toEqual([])
  })
})
