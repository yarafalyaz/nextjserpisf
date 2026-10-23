// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { AssetAnalyticalStatus } from "../asset-analytical-status"
import { mountInto, unmount, withContainer } from "@/components/forms/__tests__/form-a11y-test-utils"
import type { AssetAnalyticalStatusRow } from "@/lib/reports/asset-analytical-status-data"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)

function row(over: Partial<AssetAnalyticalStatusRow>): AssetAnalyticalStatusRow {
  return {
    assetId: 1, code: "A-1", name: "Mesin", depreciationMethod: "units_of_production",
    status: { status: "computed", amount: new Prisma.Decimal("150000") },
    totalEstimatedUnits: new Prisma.Decimal("10000"), productionUnitName: "unit",
    usefulLifeMonths: null, actualUnits: new Prisma.Decimal("150"), actualSourceName: "Laporan Produksi",
    bookValue: new Prisma.Decimal("900000"), notJournaled: false, ...over,
  }
}

describe("AssetAnalyticalStatus — render loader apa adanya", () => {
  it("computed: beban loader tampil, tanpa tombol posting", () => {
    withContainer((c) => {
      const r = mountInto(c, <AssetAnalyticalStatus row={row({})} periodLabel="10/2026" />)
      expect(c.textContent).toContain("Terhitung analitis")
      expect(c.textContent).toContain("Rp 150.000")
      expect(c.textContent).toContain("Unit Produksi (analitis, tanpa jurnal)")
      expect(c.querySelector("button")).toBeNull()
      unmount(r, c)
    })
  })
  it("skip unit-nol + at-residual", () => {
    withContainer((c) => {
      const r = mountInto(c, <AssetAnalyticalStatus row={row({ status: { status: "skip", reason: "unit-nol" } })} periodLabel="10/2026" />)
      expect(c.textContent).toContain("Unit aktual periode ini 0")
      unmount(r, c)
      const r2 = mountInto(c, <AssetAnalyticalStatus row={row({ status: { status: "skip", reason: "at-residual" } })} periodLabel="10/2026" />)
      expect(c.textContent).toContain("nilai residu")
      unmount(r2, c)
    })
  })
  it("reject missing-parameter: nama parameter Indonesia + belum terbekukan", () => {
    withContainer((c) => {
      const r = mountInto(c, <AssetAnalyticalStatus row={row({ status: { status: "reject", reason: "missing-parameter", parameter: "actualUnits" }, actualUnits: null })} periodLabel="10/2026" />)
      expect(c.textContent).toContain("Parameter Unit aktual belum terbekukan")
      expect(c.textContent).toContain("dokumen belum ada")
      unmount(r, c)
    })
  })
  it("SYD computed + notJournaled flag", () => {
    withContainer((c) => {
      const r = mountInto(c, <AssetAnalyticalStatus row={row({ depreciationMethod: "sum_of_years_digits", usefulLifeMonths: 60, status: { status: "computed", amount: new Prisma.Decimal("200000") }, notJournaled: true })} periodLabel="10/2026" />)
      expect(c.textContent).toContain("Masa manfaat terbekukan: 60 bulan")
      expect(c.textContent).toContain("Belum ada jurnal perolehan POSTED")
      unmount(r, c)
    })
  })
  it("skip held-for-sale/already-posted/not-started + reject unregistered", () => {
    withContainer((c) => {
      for (const [status, text] of [
        [{ status: "skip", reason: "held-for-sale" }, "ditahan untuk dijual"],
        [{ status: "skip", reason: "already-posted" }, "sudah berjurnal"],
        [{ status: "skip", reason: "not-started" }, "belum mulai"],
        [{ status: "reject", reason: "unregistered-status", method: "aneh" }, "tidak terdaftar"],
      ] as const) {
        const r = mountInto(c, <AssetAnalyticalStatus row={row({ status: status as never })} periodLabel="10/2026" />)
        expect(c.textContent).toContain(text)
        unmount(r, c)
      }
    })
  })
})
