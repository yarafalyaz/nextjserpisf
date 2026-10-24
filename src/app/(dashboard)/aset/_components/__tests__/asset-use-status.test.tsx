// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@prisma/client"
import {
  AssetCronDisposition,
  AssetUseFlagSummaryCard,
  AssetUseStatus,
} from "../asset-use-status"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock(
  "next/navigation",
  async () =>
    (await import("@/components/forms/__tests__/form-a11y-test-utils"))
      .routerModule,
)

describe("AssetUseStatus — status terdaftar apa adanya (Putusan 1)", () => {
  it("held_for_sale tampil Dimiliki untuk Dijual", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetUseStatus status="held_for_sale" />)
      expect(container.textContent).toContain("Dimiliki untuk Dijual")
      expect(container.textContent).not.toContain("Status tidak terdaftar")
      unmount(root, container)
    })
  })

  it("status karangan tampil temuan + nilai mentah, bukan label sah", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetUseStatus status="maintenance" />)
      expect(container.textContent).toContain("Status tidak terdaftar")
      expect(container.textContent).toContain("Nilai tersimpan: maintenance")
      expect(container.textContent).not.toContain("Perbaikan")
      unmount(root, container)
    })
  })
})

describe("AssetCronDisposition — alasan lewatan bernama (Putusan 2/3/4)", () => {
  it("held-for-sale: komersial berhenti, fiskal tetap berjalan", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetCronDisposition
          disposition={{ action: "skip", reason: "held-for-sale", fiscalContinues: true }}
        />,
      )
      expect(container.textContent).toContain("Dimiliki untuk Dijual")
      expect(container.textContent).toContain("Penyusutan fiskal tetap berjalan.")
      unmount(root, container)
    })
  })

  it("process tampil diproses, tanpa alasan lewatan", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetCronDisposition
          disposition={{ action: "process", reason: null, fiscalContinues: true }}
        />,
      )
      expect(container.textContent).toContain("Diproses penyusutan periode ini.")
      unmount(root, container)
    })
  })
})

describe("AssetUseFlagSummaryCard — penanda registry apa adanya (Putusan 4)", () => {
  it("empat penanda tampil; status tak terdaftar sebut ID aset", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetUseFlagSummaryCard
          summary={{
            fullyDepreciatedInUseCount: 2,
            fullyDepreciatedInUseGross: new Prisma.Decimal(15000000),
            idleCount: 1,
            heldForSaleCount: 3,
            unregisteredStatusAssetIds: [7, 9],
          }}
        />,
      )
      expect(container.textContent).toContain("Tersusutkan penuh, masih dipakai")
      expect(container.textContent).toContain("2 aset")
      expect(container.textContent).toContain("Menganggur (tetap Aktif)")
      expect(container.textContent).toContain("3 aset")
      expect(container.textContent).toContain("ID aset: 7, 9")
      unmount(root, container)
    })
  })

  it("tanpa temuan: Status tidak terdaftar = Tidak ada", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetUseFlagSummaryCard
          summary={{
            fullyDepreciatedInUseCount: 0,
            fullyDepreciatedInUseGross: new Prisma.Decimal(0),
            idleCount: 0,
            heldForSaleCount: 0,
            unregisteredStatusAssetIds: [],
          }}
        />,
      )
      expect(container.textContent).toContain("Tidak ada")
      unmount(root, container)
    })
  })
})
