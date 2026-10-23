// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetChangeEventPanel, type AssetChangeEventRow } from "../asset-change-event-panel"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  postAssetChangeEventAction: vi.fn().mockResolvedValue({ success: true, id: 1 }),
  postAssetReclassificationAction: vi.fn().mockResolvedValue({ success: true, id: 2 }),
  reverseAssetChangeEventAction: vi.fn().mockResolvedValue({ success: true, id: 3 }),
}))

const REVAL_ROW: AssetChangeEventRow = {
  id: 7,
  kind: "REVALUATION_UP",
  status: "POSTED",
  effectiveDate: "2026-10-01T00:00:00.000Z",
  sourceDocumentKey: "LAP-PENILAI-2026-001",
  journalNumber: "JRN-2026-0107",
  carryingBefore: "100000000",
  carryingAfter: "125000000",
  revaluationSurplusAfter: "25000000",
  fiscalBaseBefore: null,
  fiscalBaseAfter: null,
  finalTaxAmount: null,
  finalTaxRatePercent: null,
  surplusAccountCode: "300004",
  impairmentLossAccountCode: null,
  accumulatedImpairmentAccountCode: null,
  taxPayableAccountCode: null,
  fromCategoryName: null,
  toCategoryName: null,
  reasonCode: null,
  approvedByName: null,
  appraiserName: "KJPP Contoh",
  impairmentIndicator: null,
  recoverableBasis: null,
  recoverableAmount: null,
  djpApprovalNumber: null,
  oldMethod: null,
  newMethod: null,
  newUsefulLifeMonths: null,
  newResidualValue: null,
  reversesEventId: null,
}

const CATEGORIES = [
  { id: 1, name: "Kendaraan" },
  { id: 2, name: "Mesin" },
]

describe("AssetChangeEventPanel — riwayat terbekukan apa adanya", () => {
  it("baris POSTED: nilai snapshot + kode akun snapshot + jurnal + tombol balik tampil", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetChangeEventPanel assetId={5} events={[REVAL_ROW]} categories={CATEGORIES} currentCategoryId={1} canManage />,
      )
      expect(c.textContent).toContain("Revaluasi Naik")
      expect(c.textContent).toContain("Terposting")
      expect(c.textContent).toContain("Rp 100.000.000")
      expect(c.textContent).toContain("Rp 125.000.000")
      expect(c.textContent).toContain("Rp 25.000.000")
      expect(c.textContent).toContain("Surplus 300004")
      expect(c.textContent).toContain("LAP-PENILAI-2026-001")
      expect(c.textContent).toContain("JRN-2026-0107")
      expect(c.textContent).toContain("Penilai: KJPP Contoh")
      const buttons = [...c.querySelectorAll("button")].map((b) => b.textContent)
      expect(buttons).toContain("Balik Peristiwa")
      expect(buttons).toContain("Catat Peristiwa Perubahan")
      expect(buttons).toContain("Reklasifikasi Kategori")
      unmount(r, c)
    })
  })

  it("tanpa izin kelola: riwayat tampil, nol tombol aksi", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetChangeEventPanel assetId={5} events={[REVAL_ROW]} categories={CATEGORIES} currentCategoryId={1} canManage={false} />,
      )
      expect(c.textContent).toContain("Revaluasi Naik")
      expect(c.querySelector("button")).toBeNull()
      unmount(r, c)
    })
  })

  it("status REVERSED: label Dibalik, tanpa tombol balik", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetChangeEventPanel
          assetId={5}
          events={[{ ...REVAL_ROW, status: "REVERSED" }]}
          categories={CATEGORIES}
          currentCategoryId={1}
          canManage
        />,
      )
      expect(c.textContent).toContain("Dibalik")
      const buttons = [...c.querySelectorAll("button")].map((b) => b.textContent)
      expect(buttons).not.toContain("Balik Peristiwa")
      unmount(r, c)
    })
  })

  it("kosong: pesan belum ada peristiwa tampil", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetChangeEventPanel assetId={5} events={[]} categories={CATEGORIES} currentCategoryId={1} canManage={false} />,
      )
      expect(c.textContent).toContain("Belum ada peristiwa perubahan aset")
      unmount(r, c)
    })
  })
})
