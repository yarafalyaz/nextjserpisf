// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Prisma } from "@prisma/client"
import {
  AssetAcquisitionSummary,
  AssetAcquisitionTypeBadge,
} from "../asset-acquisition"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)

const D = (v: string) => new Prisma.Decimal(v)

describe("AssetAcquisitionTypeBadge — jenis apa adanya", () => {
  it("jenis terdaftar berlabel resmi tanpa nilai mentah", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionTypeBadge type="CREDIT_PURCHASE" />,
      )
      expect(container.textContent).toContain("Pembelian Kredit (Utang Usaha)")
      expect(container.textContent).not.toContain("Nilai tersimpan")
      unmount(root, container)
    })
  })

  it("jenis tak terdaftar = temuan + nilai mentah, bukan label sah", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionTypeBadge type="tunai" />,
      )
      expect(container.textContent).toContain("Jenis perolehan tidak terdaftar")
      expect(container.textContent).toContain("Nilai tersimpan: tunai")
      unmount(root, container)
    })
  })
})

describe("AssetAcquisitionSummary — snapshot builder apa adanya", () => {
  it("resolved kredit: lawan utang + dokumen + dasar fiskal tampil", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionSummary
          result={{
            status: "resolved",
            acquisitionType: "CREDIT_PURCHASE",
            counterpartKind: "accounts-payable",
            commercialBasis: D("50000000"),
            fiscalBasis: D("50000000"),
            fiscalBasisSource: "actual-price",
            fiscalDepreciable: true,
            inputVatAmount: D("0"),
            vatEvidence: "none",
          }}
          sourceDocumentRef="INV-VENDOR-001"
        />,
      )
      expect(container.textContent).toContain("Pembelian Kredit (Utang Usaha)")
      expect(container.textContent).toContain("INV-VENDOR-001")
      expect(container.textContent).toContain("Utang Usaha")
      expect(container.textContent).toContain("Harga Sesungguhnya")
      expect(container.textContent).toContain("Dapat disusutkan secara fiskal")
      expect(container.textContent).toContain("Belum ada faktur pajak tertaut")
      unmount(root, container)
    })
  })

  it("hibah terkecuali: dasar buku pemberi + fiskal tidak disusutkan", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionSummary
          result={{
            status: "resolved",
            acquisitionType: "GRANT_DONATION",
            counterpartKind: "grant-income",
            commercialBasis: D("80000000"),
            fiscalBasis: D("30000000"),
            fiscalBasisSource: "grantor-fiscal-book-value",
            fiscalDepreciable: false,
            inputVatAmount: D("0"),
            vatEvidence: "none",
          }}
          sourceDocumentRef="AKTA-HIBAH-01"
        />,
      )
      expect(container.textContent).toContain("Hibah / Sumbangan")
      expect(container.textContent).toContain("Nilai Sisa Buku Fiskal Pemberi")
      expect(container.textContent).toContain(
        "Tidak dapat disusutkan secara fiskal",
      )
      unmount(root, container)
    })
  })

  it("reject bernama tampil; no-journal warisan tampil eksplisit", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionSummary
          result={{ status: "reject", reason: "missing-source-document" }}
        />,
      )
      expect(container.textContent).toContain(
        "Dokumen sumber perolehan belum tercatat",
      )
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionSummary
          result={{ status: "no-journal", reason: "zero-cost-legacy" }}
        />,
      )
      expect(container.textContent).toContain(
        "Aset warisan tanpa harga perolehan",
      )
      unmount(root, container)
    })
  })

  it("dokumen sumber kosong = status eksplisit, bukan nilai kosong", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AssetAcquisitionSummary
          result={{
            status: "resolved",
            acquisitionType: "CASH_PURCHASE",
            counterpartKind: "cash-bank",
            commercialBasis: D("1000000"),
            fiscalBasis: D("1000000"),
            fiscalBasisSource: "actual-price",
            fiscalDepreciable: true,
            inputVatAmount: D("110000"),
            vatEvidence: "linked-invoice",
          }}
        />,
      )
      expect(container.textContent).toContain(
        "Belum ada dokumen sumber tercatat",
      )
      expect(container.textContent).toContain("Faktur pajak masukan tertaut")
      unmount(root, container)
    })
  })
})
