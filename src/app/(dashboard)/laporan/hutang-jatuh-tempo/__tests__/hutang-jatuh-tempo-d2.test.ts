// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// Letterhead menarik auth (next-auth/next/server) yang tidak ter-resolve di
// vitest; builder yang diuji murni — mock permukaan beratnya saja (pola
// aging-report-view.test.ts + aging-report-view-s4.test.tsx).
vi.mock("@/components/reports/report-letterhead", () => ({
  ReportLetterhead: () => null,
}))
vi.mock("@/components/lazy/aging-chart", () => ({ AgingChart: () => null }))
vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import { readFileSync } from "node:fs"
import path from "node:path"
import { buildAgingRows } from "@/components/reports/aging-report-view"

/**
 * E140-2 (spec 140-S D2): pembeda "Jatuh Tempo" vs "Total Hutang".
 * - Halaman `hutang-jatuh-tempo` wajib memberi keterangan eksplisit bahwa
 *   tagihan tanpa jatuh tempo TIDAK termasuk + tautan silang ke Total Hutang.
 * - PDF `total-hutang` (`loadPayablesTotal`) wajib melabeli totalnya
 *   "termasuk Tanpa Jatuh Tempo" + keterangan pembeda.
 */
const HUTANG_DIR = path.resolve(
  __dirname,
  "..",
)
const NOTICE_COMPONENT = path.join(
  HUTANG_DIR,
  "_components",
  "hutang-jatuh-tempo-notice.tsx",
)
const AGING_DATA = path.resolve(
  HUTANG_DIR,
  "..",
  "..",
  "..",
  "..",
  "lib",
  "reports",
  "aging-reports-data.ts",
)

describe("E140-2 label D2 jatuh-tempo vs total hutang", () => {
  it("halaman hutang-jatuh-tempo: keterangan tidak-termasuk + tautan silang Total Hutang", () => {
    const page = readFileSync(path.join(HUTANG_DIR, "page.tsx"), "utf8")
    const notice = readFileSync(NOTICE_COMPONENT, "utf8")
    // Keterangan + tautan hidup di komponen notice khusus (bukan menumpang
    // narasi): page wajib me-render komponennya.
    expect(page).toContain("HutangJatuhTempoNotice")
    expect(page).toContain("<HutangJatuhTempoNotice />")
    expect(notice).toContain("tanpa tanggal jatuh tempo")
    expect(notice).toContain("/laporan/total-hutang")
    expect(notice).toContain("Total Hutang")
  })

  it("PDF total-hutang: label Jumlah mencakup Tanpa Jatuh Tempo + keterangan pembeda", () => {
    const source = readFileSync(AGING_DATA, "utf8")
    expect(source).toContain("Jumlah Hutang (termasuk Tanpa Jatuh Tempo)")
    expect(source).toContain("Tanpa Jatuh Tempo")
    // Keterangan pembeda menunjuk laporan yang dibedakan (Hutang Jatuh Tempo).
    expect(source).toContain("Hutang Jatuh Tempo")
  })

  it("layar hutang-jatuh-tempo tetap membuang tagihan tanpa dueDate (populasi D2 sah beda)", () => {
    const rows = buildAgingRows(
      [
        {
          party: "V",
          documentNo: "VB-NODUE",
          dueDate: null,
          grandTotal: 500_000,
          paidAmount: 0,
        },
        {
          party: "V",
          documentNo: "VB-DUE",
          dueDate: new Date("2026-10-10T00:00:00.000Z"),
          grandTotal: 500_000,
          paidAmount: 0,
        },
      ],
      new Date("2026-10-24T05:00:00.000Z"),
    )
    expect(rows.map((r) => r.documentNo)).toEqual(["VB-DUE"])
  })
})
