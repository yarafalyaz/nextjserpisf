// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// Letterhead menarik auth (next-auth/next/server) dan grafik recharts berat —
// mock permukaan beratnya saja; tabel ringkasan jadi fokus uji.
vi.mock("@/components/reports/report-letterhead", () => ({ ReportLetterhead: () => null }))
vi.mock("@/components/lazy/aging-chart", () => ({ AgingChart: () => null }))
vi.mock("@/components/reports/export-buttons", () => ({ ExportButtons: () => null }))

import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { AgingReportView, buildAgingRows } from "../aging-report-view"

const NOW = new Date("2026-10-24T05:00:00.000Z")
const DUE = new Date("2026-10-10T00:00:00.000Z")

/**
 * FIN-BR-009-S4 (vonis t_1d4e7168): ringkasan memakai header "Dokumen" —
 * kolom ini menghitung dokumen, bukan nominal, agar tidak dibaca sebagai
 * nominal oleh pembaca cepat.
 */
describe("FIN-BR-009-S4 header Dokumen ringkasan aging", () => {
  it('header ringkasan persis "Dokumen", bukan "Jumlah"', () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const rows = buildAgingRows(
      [{ party: "Pelanggan A", documentNo: "INV-1", dueDate: DUE, grandTotal: 1_000_000, paidAmount: 200_000 }],
      NOW,
    )
    act(() => {
      root.render(
        createElement(AgingReportView, {
          rows,
          texts: {
            pageTitle: "Piutang Jatuh Tempo",
            exportTitle: "Piutang_Jatuh_Tempo",
            pdfSlug: "piutang-jatuh-tempo",
            letterheadSubtitle: "Umur Piutang",
            narration: "Ringkasan singkat.",
            kpiLabel: "Total Piutang",
            summaryTitle: "Ringkasan Umur Piutang",
            chartTitle: "Grafik Umur Piutang",
            chartValueLabel: "Nilai Piutang",
            chartAriaLabel: "Grafik umur piutang per kategori umur",
            detailTitle: "Detail Piutang",
            partyHeader: "Pelanggan",
            documentHeader: "No. Faktur",
            emptyText: "Tidak ada piutang jatuh tempo",
            outstandingClassName: "font-semibold",
          },
        }),
      )
    })
    try {
      const summaryTable = container.querySelector('[data-report-table="Ringkasan Umur Piutang"]')
      const headerCells = summaryTable
        ? [...summaryTable.querySelectorAll("th")].map((el) => el.textContent?.trim())
        : []
      expect(headerCells).toEqual(["Kategori", "Dokumen", "Total (Rp)"])
      expect(headerCells).not.toContain("Jumlah")
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
