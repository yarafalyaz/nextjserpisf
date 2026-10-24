// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { AssetCapitalizationSummary } from "../asset-capitalization"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"
import type { FiscalCapitalizationResult } from "@/lib/finance/asset-capitalization"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)

const FISCAL: FiscalCapitalizationResult = {
  fiscalBookValueAfter: new Prisma.Decimal("212500000.00"),
  appliedLifeExtensionMonths: 24,
  remainingFiscalLifeMonthsAfter: 60,
  cappedByGroupLife: false,
  monthlyFiscalDepreciation: new Prisma.Decimal("3541666.67"),
  depreciationStartMonth: "2026-01",
}

describe("AssetCapitalizationSummary — hasil builder F-108-V apa adanya", () => {
  it("capitalize: biaya dikapitalisasi + masa manfaat baru + tarif baru tampil, nol tombol jurnal", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetCapitalizationSummary
          classification={{ decision: "capitalize" }}
          fiscalResult={FISCAL}
        />,
      )
      expect(c.textContent).toContain("Dikapitalisasi")
      expect(c.textContent).toContain("Rp 212.500.000,00")
      expect(c.textContent).toContain(
        "Sisa masa manfaat fiskal sesudah kapitalisasi: 60 bulan",
      )
      expect(c.textContent).toContain(
        "Tambahan masa manfaat terpakai: 24 bulan",
      )
      expect(c.textContent).toContain(
        "Beban fiskal bulanan atas basis baru: Rp 3.541.666,67",
      )
      expect(c.textContent).toContain(
        "Penyusutan atas basis baru mulai bulan 2026-01",
      )
      expect(c.querySelector("button")).toBeNull()
      unmount(r, c)
    })
  })

  it("expense: dibeban + syarat gugur bernama, nol angka fiskal karangan", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetCapitalizationSummary
          classification={{ decision: "expense", failedConditions: ["b"] }}
          fiscalResult={null}
        />,
      )
      expect(c.textContent).toContain("Dibebankan sebagai beban periode")
      expect(c.textContent).toContain(
        "Masa manfaat pengeluaran tidak lebih dari 1 tahun",
      )
      expect(c.textContent).not.toContain("Rp 212.500.000,00")
      expect(c.textContent).not.toContain("Sisa masa manfaat fiskal")
      expect(c.querySelector("button")).toBeNull()
      unmount(r, c)
    })
  })

  it("plafon kelompok tampil hanya bila builder cappedByGroupLife", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetCapitalizationSummary
          classification={{ decision: "capitalize" }}
          fiscalResult={{ ...FISCAL, cappedByGroupLife: true, remainingFiscalLifeMonthsAfter: 96 }}
        />,
      )
      expect(c.textContent).toContain(
        "Sisa masa manfaat dipotong plafon masa manfaat kelompok fiskal",
      )
      expect(c.textContent).toContain("96 bulan")
      unmount(r, c)
    })
  })

  it("capitalize tanpa hasil fiskal = status belum dihitung, bukan angka kosong", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetCapitalizationSummary
          classification={{ decision: "capitalize" }}
          fiscalResult={null}
        />,
      )
      expect(c.textContent).toContain(
        "Basis fiskal sesudah kapitalisasi belum dihitung.",
      )
      expect(c.querySelector("button")).toBeNull()
      unmount(r, c)
    })
  })

  it("metode tidak sah (monthly null) tampil belum dapat dihitung, bukan Rp 0", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetCapitalizationSummary
          classification={{ decision: "capitalize" }}
          fiscalResult={{ ...FISCAL, monthlyFiscalDepreciation: null }}
        />,
      )
      expect(c.textContent).toContain(
        "Beban fiskal bulanan: belum dapat dihitung untuk metode/kelompok ini",
      )
      expect(c.textContent).not.toContain("Rp 0")
      unmount(r, c)
    })
  })
})
