// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { JobBillingCard } from "../job-billing-card"
import type { JobBillingSummaryResult } from "@/lib/reports/job-billing-summary-data"

const base: JobBillingSummaryResult = {
  quotationId: 9,
  quotationDocumentNo: "Q-009",
  nilaiBerjalan: 1_000_000,
  sudahDitagih: 400_000,
  sudahDibayar: 150_000,
  sisaBelumDitagih: 600_000,
  sisaBelumDibayar: 250_000,
  uangMukaDiterima: 500_000,
  overbilled: false,
  billedInvoices: [{ id: 1, documentNo: "INV-1", status: "posted", grandTotal: 400_000, paidAmount: 150_000 }],
  workOrders: [{ id: 5, documentNo: "WO-5", projectId: null }],
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, root }
}

describe("JobBillingCard F-2026-10-20-03", () => {
  it("render enam angka read-model + invoice + link WO", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const text = container.textContent ?? ""
    for (const label of ["Nilai berjalan", "Sudah ditagih", "Sudah dibayar", "Sisa belum ditagih", "Sisa belum dibayar", "Uang muka diterima"]) {
      expect(text).toContain(label)
    }
    expect(text).toContain("INV-1")
    expect(container.querySelector('a[href="/produksi/perintah-kerja/5"]')?.textContent).toBe("WO-5")
    expect(container.querySelector('[role="alert"]')).toBeNull()
    act(() => root.unmount()); container.remove()
  })

  it("overbilled tampil role=alert; tanpa invoice tampil teks kosong", () => {
    const over: JobBillingSummaryResult = { ...base, sudahDitagih: 1_200_000, sisaBelumDitagih: -200_000, overbilled: true, billedInvoices: [], workOrders: [] }
    const { container, root } = render(<JobBillingCard summary={over} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Overbilled")
    expect(container.textContent).toContain("Belum ada invoice posted")
    act(() => root.unmount()); container.remove()
  })
})
