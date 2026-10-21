// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ProjectPlCard } from "../project-pl-card"
import { buildProjectPl, type ProjectPlInput } from "@/lib/reports/project-pl"
import type { ProjectPlRow } from "@/lib/reports/project-pl-data"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function base(over: Partial<ProjectPlInput> = {}): ProjectPlInput {
  return {
    projectId: 1,
    invoices: [],
    workOrders: [],
    materialIssues: [],
    productionCosts: [],
    expenses: [],
    pettyCash: [],
    vendorBills: [],
    timesheets: [],
    ...over,
  }
}

function row(pl: ReturnType<typeof buildProjectPl>, over: Partial<ProjectPlRow> = {}): ProjectPlRow {
  return {
    ...pl,
    projectDocumentNo: "PRJ-001",
    projectName: "Restorasi Kijang",
    customerName: "Budi",
    vehiclePlate: "B 1234 CD",
    projectStatus: "active",
    ...over,
  }
}

describe("ProjectPlCard F-2026-10-21-029", () => {
  it("angka tampil persis output builder: ProductionCost 5jt masuk biaya, laba 15jt", () => {
    const pl = buildProjectPl(
      base({
        workOrders: [{ id: 10, projectId: 1, quotationId: 100, status: "in_progress" }],
        invoices: [
          { id: 1, projectId: 1, quotationId: null, status: "posted", subtotal: 20_000_000, discount: 0, deletedAt: null },
        ],
        productionCosts: [
          { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: 7, purchaseOrderId: null },
        ],
        timesheets: [{ id: 7, projectId: 1, hours: 40 }],
      }),
    )
    const { container, root } = renderCard(<ProjectPlCard rows={[row(pl)]} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Laba Rugi per Proyek"]')).not.toBeNull()
    expect(text).toContain("Restorasi Kijang")
    expect(text).toContain("20.000.000")
    expect(text).toContain("5.000.000")
    expect(text).toContain("15.000.000")
    expect(text).toContain("75.0%")
    // timesheet #7 sudah ditarik -> memo jam tidak tampil
    expect(text).not.toContain("Memo Jam Timesheet Belum Ditarik")
    unmountCard(root)
  })

  it("memo jam belum ditarik tampil terpisah, berlabel bukan biaya", () => {
    const pl = buildProjectPl(
      base({
        timesheets: [{ id: 9, projectId: 1, hours: 12.5 }],
      }),
    )
    const { container, root } = renderCard(<ProjectPlCard rows={[row(pl)]} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Memo jam timesheet belum ditarik"]')).not.toBeNull()
    expect(text).toContain("Memo Jam Timesheet Belum Ditarik")
    expect(text).toContain("bukan biaya dan tidak mengurangi laba")
    expect(text).toContain("12,50 jam")
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const { container, root } = renderCard(<ProjectPlCard rows={[]} />)
    expect(container.textContent ?? "").toContain("Tidak ada proyek dalam periode ini")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
