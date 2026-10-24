import { describe, expect, it } from "vitest"
import {
  reconcileScrapLine,
  scrapReviewStatusAfterComplete,
  validateScrapReview,
  validateScrapWeightKg,
  validateUsableRemnant,
} from "../scrap-physical"

const usableBase = {
  dimensions: "1200x300 mm",
  measuredSize: 1200,
  minMeasureSnapshot: 500,
  sourceType: "material_issue_item",
  sourceId: 42,
}

describe("validateUsableRemnant (BR-SCRAP-04/05, AC-SCRAP-1)", () => {
  it("lengkap + di atas ambang = sah", () => {
    expect(validateUsableRemnant(usableBase)).toBeNull()
  })

  it("tanpa dimensi ditolak", () => {
    expect(validateUsableRemnant({ ...usableBase, dimensions: " " })).toMatch(/dimensi/)
    expect(validateUsableRemnant({ ...usableBase, dimensions: null })).toMatch(/dimensi/)
  })

  it("tanpa tautan issue ditolak", () => {
    expect(validateUsableRemnant({ ...usableBase, sourceType: null })).toMatch(/tertaut/)
    expect(validateUsableRemnant({ ...usableBase, sourceType: "work_order" })).toMatch(/tertaut/)
    expect(validateUsableRemnant({ ...usableBase, sourceId: null })).toMatch(/tertaut/)
    expect(validateUsableRemnant({ ...usableBase, sourceId: 0 })).toMatch(/tertaut/)
  })

  it("ambang belum ditetapkan (null) ditolak jujur, bukan angka karangan", () => {
    expect(validateUsableRemnant({ ...usableBase, minMeasureSnapshot: null })).toMatch(/belum ditetapkan/)
    expect(validateUsableRemnant({ ...usableBase, minMeasureSnapshot: 0 })).toMatch(/belum ditetapkan/)
  })

  it("di bawah ambang ditolak sebagai usable", () => {
    expect(validateUsableRemnant({ ...usableBase, measuredSize: 300 })).toMatch(/di bawah ambang/)
    expect(validateUsableRemnant({ ...usableBase, measuredSize: 500 })).toBeNull()
  })

  it("ukuran terukur kosong/nol ditolak", () => {
    expect(validateUsableRemnant({ ...usableBase, measuredSize: null })).toMatch(/ukuran terukur/)
    expect(validateUsableRemnant({ ...usableBase, measuredSize: 0 })).toMatch(/ukuran terukur/)
  })
})

describe("validateScrapWeightKg (BR-SCRAP-06/10, AC-SCRAP-7)", () => {
  it("kg > 0 sah; kosong/nol/negatif ditolak", () => {
    expect(validateScrapWeightKg(12.5)).toBeNull()
    expect(validateScrapWeightKg(null)).toMatch(/kg/)
    expect(validateScrapWeightKg(0)).toMatch(/kg/)
    expect(validateScrapWeightKg(-1)).toMatch(/kg/)
  })
})

describe("scrapReviewStatusAfterComplete (BR-SCRAP-08, AC-SCRAP-4)", () => {
  it("abnormal > 0 masuk menunggu_tinjau; 0/null tidak masuk antrean", () => {
    expect(scrapReviewStatusAfterComplete(3)).toBe("menunggu_tinjau")
    expect(scrapReviewStatusAfterComplete(0)).toBeNull()
    expect(scrapReviewStatusAfterComplete(null)).toBeNull()
    expect(scrapReviewStatusAfterComplete(undefined)).toBeNull()
  })
})

describe("validateScrapReview (BR-SCRAP-09, AC-SCRAP-5)", () => {
  it("diterima_wajar sah tanpa catatan; kelalaian wajib catatan", () => {
    expect(validateScrapReview({ disposition: "diterima_wajar" })).toBeNull()
    expect(validateScrapReview({ disposition: "kelalaian", note: "  " })).toMatch(/catatan/)
    expect(validateScrapReview({ disposition: "kelalaian", note: "teguran + pelatihan potong" })).toBeNull()
  })

  it("disposisi karangan ditolak", () => {
    expect(validateScrapReview({ disposition: "bebas" })).toMatch(/Disposisi/)
    expect(validateScrapReview({ disposition: null })).toMatch(/Disposisi/)
  })
})

describe("reconcileScrapLine (BR-SCRAP-07, AC-SCRAP-3)", () => {
  it("issue = terpasang + remnant + scrap = bersih", () => {
    expect(reconcileScrapLine({ issueQty: 10, installedQty: 7, remnantQty: 2, scrapQty: 1 }))
      .toMatchObject({ varianceQty: 0, hasFinding: false })
  })

  it("selisih tampil temuan, angka tidak diubah", () => {
    const r = reconcileScrapLine({ issueQty: 10, installedQty: 6, remnantQty: 2, scrapQty: 1 })
    expect(r.varianceQty).toBe(1)
    expect(r.hasFinding).toBe(true)
    expect(r.issueQty).toBe(10)
  })
})
