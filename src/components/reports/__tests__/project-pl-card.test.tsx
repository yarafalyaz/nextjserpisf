// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ProjectPlCard } from "../project-pl-card"
import { buildProjectPl } from "@/lib/reports/project-pl"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { projectPlBase, projectPlRow, projectPlWithCost } from "./project-pl-test-fixtures"

afterEach(() => {
  clearRenderedCards()
})

describe("ProjectPlCard F-2026-10-21-029", () => {
  it("angka tampil persis output builder: ProductionCost 5jt masuk biaya, laba 15jt", () => {
    const { container, root } = renderCard(<ProjectPlCard rows={[projectPlRow(projectPlWithCost())]} />)
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
    const pl = buildProjectPl(projectPlBase({ timesheets: [{ id: 9, projectId: 1, hours: 12.5 }] }))
    const { container, root } = renderCard(<ProjectPlCard rows={[projectPlRow(pl)]} />)
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
