// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import {
  AssetEventMappingStatus,
  ASSET_CHANGE_EVENT_KIND_LABELS,
  labelOf,
} from "../asset-change-event"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)

describe("AssetEventMappingStatus — status mapping F-128 apa adanya", () => {
  it("semua NULL: tiga baris belum-terpetakan tampil, tidak disembunyikan", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetEventMappingStatus
          mapping={{ revaluationSurplus: null, impairmentLoss: null, accumulatedImpairment: null }}
        />,
      )
      expect(c.textContent).toContain("Akun Surplus Revaluasi")
      expect(c.textContent).toContain("Akun Beban Penurunan Nilai")
      expect(c.textContent).toContain("Akun Akumulasi Penurunan Nilai")
      expect(c.textContent?.match(/Belum terpetakan/g)?.length).toBe(3)
      expect(c.textContent).toContain("ditolak server")
      unmount(r, c)
    })
  })

  it("terpetakan: kode akun tampil, nol lencana belum-terpetakan untuk baris itu", () => {
    withContainer((c) => {
      const r = mountInto(
        c,
        <AssetEventMappingStatus
          mapping={{
            revaluationSurplus: { id: 9, code: "300004" },
            impairmentLoss: { id: 10, code: "600027" },
            accumulatedImpairment: null,
          }}
        />,
      )
      expect(c.textContent).toContain("300004")
      expect(c.textContent).toContain("600027")
      expect(c.textContent?.match(/Belum terpetakan/g)?.length).toBe(1)
      unmount(r, c)
    })
  })
})

describe("label peristiwa perubahan aset", () => {
  it("semua kind terdaftar punya label Indonesia; nilai asing tampil apa adanya", () => {
    for (const kind of [
      "REVALUATION_UP",
      "REVALUATION_DOWN",
      "IMPAIRMENT",
      "IMPAIRMENT_REVERSAL",
      "FISCAL_REVALUATION_APPROVED",
      "RECLASSIFICATION",
      "COMMERCIAL_METHOD_CHANGE",
      "FISCAL_METHOD_CHANGE",
      "ESTIMATE_CHANGE",
    ]) {
      expect(ASSET_CHANGE_EVENT_KIND_LABELS[kind]).toBeTruthy()
      expect(ASSET_CHANGE_EVENT_KIND_LABELS[kind]).not.toBe(kind)
    }
    expect(labelOf(ASSET_CHANGE_EVENT_KIND_LABELS, "JENIS_ASING")).toBe("JENIS_ASING")
    expect(labelOf(ASSET_CHANGE_EVENT_KIND_LABELS, null)).toBe("-")
  })
})
