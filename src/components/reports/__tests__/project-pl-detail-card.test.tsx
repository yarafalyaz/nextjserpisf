// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ProjectPlDetailCard } from "../project-pl-detail-card"
import { buildProjectPl } from "@/lib/reports/project-pl"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { projectPlBase, projectPlWithCost } from "./project-pl-test-fixtures"

afterEach(() => {
  clearRenderedCards()
})

describe("ProjectPlDetailCard F-2026-10-21-029", () => {
  it("laba/margin/pendapatan tampil persis output builder, tanpa agregasi UI", () => {
    const { container, root } = renderCard(<ProjectPlDetailCard pl={projectPlWithCost()} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Laba Rugi Proyek"]')).not.toBeNull()
    expect(text).toContain("Rp 15.000.000")
    expect(text).toContain("Rp 20.000.000")
    expect(text).toContain("Rp 5.000.000")
    expect(text).toContain("75.0% margin")
    expect(text).not.toContain("Memo Jam Timesheet Belum Ditarik")
    unmountCard(root)
  })

  it("memo jam belum ditarik tampil dengan label bukan biaya", () => {
    const pl = buildProjectPl(
      projectPlBase({
        invoices: [
          { id: 1, projectId: 1, quotationId: null, status: "posted", subtotal: 1_000_000, discount: 0, deletedAt: null },
        ],
        timesheets: [{ id: 9, projectId: 1, hours: 3 }],
      }),
    )
    const { container, root } = renderCard(<ProjectPlDetailCard pl={pl} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Memo jam timesheet belum ditarik"]')).not.toBeNull()
    expect(text).toContain("bukan biaya dan tidak mengurangi laba")
    expect(text).toContain("3,00 jam")
    unmountCard(root)
  })

  it("proyek tanpa data tampil keadaan kosong, bukan angka nol menyesatkan", () => {
    const pl = buildProjectPl(projectPlBase())
    const { container, root } = renderCard(<ProjectPlDetailCard pl={pl} />)
    expect(container.textContent ?? "").toContain("Belum ada data laba rugi untuk proyek ini")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("jejak sumber aktual tampil jumlah + id builder verbatim (PROJ-BR-004 G3)", () => {
    const pl = buildProjectPl(
      projectPlBase({
        workOrders: [{ id: 10, projectId: 1, quotationId: null, status: "in_progress" }],
        invoices: [
          { id: 7, projectId: 1, quotationId: null, status: "posted", subtotal: 2_000_000, discount: 0, deletedAt: null },
        ],
        materialIssues: [
          { id: 11, projectId: 1, workOrderId: null, status: "completed", items: [{ qty: 2, cost: 100_000 }] },
          { id: 12, projectId: 1, workOrderId: null, status: "completed", items: [{ qty: 1, cost: 50_000 }] },
        ],
        vendorBills: [
          { id: 21, projectId: 1, purchaseOrderId: null, status: "confirmed", grandTotal: 300_000, deletedAt: null },
        ],
      }),
    )
    const { container, root } = renderCard(<ProjectPlDetailCard pl={pl} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Invoice sumber: 1 dokumen (#7)")
    expect(text).toContain("Pengeluaran material sumber: 2 dokumen (#11, #12)")
    expect(text).toContain("Tagihan vendor sumber: 1 dokumen (#21)")
    unmountCard(root)
  })

  it("tanpa dokumen sumber, jejak tidak tampil (bukan nol karangan)", () => {
    const pl = buildProjectPl(
      projectPlBase({
        workOrders: [{ id: 10, projectId: 1, quotationId: null, status: "in_progress" }],
        productionCosts: [{ workOrderId: 10, amount: 5_000_000, sourceTimesheetId: null, purchaseOrderId: null }],
      }),
    )
    const { container, root } = renderCard(<ProjectPlDetailCard pl={pl} />)
    const text = container.textContent ?? ""
    expect(text).not.toContain("dokumen (#")
    expect(text).not.toContain("Invoice sumber")
    unmountCard(root)
  })
})
