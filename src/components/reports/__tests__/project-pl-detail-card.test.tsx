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
})
