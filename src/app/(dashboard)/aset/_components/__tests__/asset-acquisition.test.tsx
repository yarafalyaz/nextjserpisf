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

function expectAcquisitionRender(node: React.ReactElement, expected: string[]) {
  withContainer((container) => {
    const root = mountInto(container, node)
    for (const text of expected) {
      expect(container.textContent).toContain(text)
    }
    unmount(root, container)
  })
}

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
    expectAcquisitionRender(<AssetAcquisitionTypeBadge type="tunai" />, [
      "Jenis perolehan tidak terdaftar",
      "Nilai tersimpan: tunai",
    ])
  })
})

describe("AssetAcquisitionSummary — snapshot builder apa adanya", () => {
  it("resolved kredit: lawan utang + dokumen + dasar fiskal tampil", () => {
    expectAcquisitionRender(
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
      [
        "Pembelian Kredit (Utang Usaha)",
        "INV-VENDOR-001",
        "Utang Usaha",
        "Harga Sesungguhnya",
        "Dapat disusutkan secara fiskal",
        "Belum ada faktur pajak tertaut",
      ],
    )
  })

  it("hibah terkecuali: dasar buku pemberi + fiskal tidak disusutkan", () => {
    expectAcquisitionRender(
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
      [
        "Hibah / Sumbangan",
        "Nilai Sisa Buku Fiskal Pemberi",
        "Tidak dapat disusutkan secara fiskal",
      ],
    )
  })

  it("reject bernama tampil; no-journal warisan tampil eksplisit", () => {
    expectAcquisitionRender(
      <AssetAcquisitionSummary
        result={{ status: "reject", reason: "missing-source-document" }}
      />,
      ["Dokumen sumber perolehan belum tercatat"],
    )
    expectAcquisitionRender(
      <AssetAcquisitionSummary
        result={{ status: "no-journal", reason: "zero-cost-legacy" }}
      />,
      ["Aset warisan tanpa harga perolehan"],
    )
  })

  it("dokumen sumber kosong = status eksplisit, bukan nilai kosong", () => {
    expectAcquisitionRender(
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
      ["Belum ada dokumen sumber tercatat", "Faktur pajak masukan tertaut"],
    )
  })
})
