// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { SalesTargetAchievementCard } from "../sales-target-achievement-card"
import {
  buildSalesTargetAchievement,
  SALES_TARGET_NOTICE,
} from "@/lib/reports/sales-target-achievement"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const RANGE = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-31T23:59:59Z") }

function reportExample() {
  return buildSalesTargetAchievement({
    range: RANGE,
    targets: [
      {
        id: 1,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z"),
        targetAmount: 1_000_000,
        notes: null,
        modifiedAfterPeriodStartAt: null,
      },
      {
        id: 2,
        salesEmployeeId: 1,
        salesEmployeeName: "Budi",
        periodStart: new Date("2026-09-15T00:00:00Z"),
        periodEnd: new Date("2026-10-15T00:00:00Z"),
        targetAmount: 2_000_000,
        notes: null,
        modifiedAfterPeriodStartAt: new Date("2026-10-05T00:00:00Z"),
      },
    ],
    invoices: [
      { salesEmployeeId: 2, salesEmployeeName: "Sari", date: new Date("2026-10-10T00:00:00Z"), grandTotal: 750_000 },
      { salesEmployeeId: 1, salesEmployeeName: "Budi", date: new Date("2026-10-10T00:00:00Z"), grandTotal: 500_000 },
      { salesEmployeeId: 3, salesEmployeeName: "Citra", date: new Date("2026-10-12T00:00:00Z"), grandTotal: 300_000 },
      { salesEmployeeId: null, salesEmployeeName: null, date: new Date("2026-10-12T00:00:00Z"), grandTotal: 200_000 },
    ],
  })
}

describe("SalesTargetAchievementCard F-2026-10-22-088-S", () => {
  it("kolom verbatim + notice verbatim + angka builder persis", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_TARGET_NOTICE)
    expect(text).toContain(
      "Laporan informatif dari snapshot penjual di faktur lunas — bukan dasar bonus, jurnal, atau pembayaran. Retur penjualan selesai (completed) mengurangi pencapaian pada periode tanggal retur.",
    )
    expect(
      container.querySelector("[data-report-narration]")?.getAttribute("data-report-narration"),
    ).toBe(SALES_TARGET_NOTICE)
    for (const col of ["Penjual", "Periode Target", "Target (Rp)", "Pencapaian (Rp)", "Pencapaian (%)", "Selisih (Rp)", "Faktur Lunas"]) {
      expect(text).toContain(col)
    }
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 750.000")
    expect(text).toContain("75,00%")
    expect(text).toContain("Rp -250.000")
    unmountCard(root)
  })

  it("periode tidak utuh: lencana verbatim + persen/selisih kosong bukan 0%", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Periode target tidak utuh — persen tidak dihitung")
    expect(text).toContain("Target diubah 05/10/2026")
    // Budi persen null -> sel persennya kosong; persen tampil hanya Sari + total perusahaan.
    const percents = [...container.querySelectorAll("td")].map((td) => td.textContent ?? "").filter((t) => t.includes("%"))
    expect(percents).toEqual(["75,00%", "75,00%"])
    unmountCard(root)
  })

  it("tanpa target + ember tanpa penjual verbatim, persen kosong", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Citra")
    expect(text).toContain("Tanpa target")
    expect(text).toContain("Tanpa penjual (dokumen lama)")
    expect(text).toContain("Rp 300.000")
    expect(text).toContain("Rp 200.000")
    unmountCard(root)
  })

  it("kosong: notice tetap + teks kosong, tanpa tabel", () => {
    const empty = buildSalesTargetAchievement({ range: RANGE, targets: [], invoices: [] })
    const { container, root } = renderCard(<SalesTargetAchievementCard report={empty} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_TARGET_NOTICE)
    expect(text).toContain("Tidak ada target atau faktur lunas pada masa ini.")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("tanpa kata bonus/insentif terutang sebagai klaim UI", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).not.toMatch(/insentif terutang|bonus terutang/i)
    unmountCard(root)
  })
})
