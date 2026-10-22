import { describe, it, expect } from "vitest"

/**
 * Builder murni F-2026-10-22-078-S (AC-MR-3/4 versi turunan):
 * terpenuhi hanya dari qty DITERIMA kumulatif; transfer lahir saja
 * tidak dihitung loader/service (mereka hanya meneruskan baris
 * transfer received). Label §6 verbatim.
 */
import {
  MATERIAL_REQUEST_STATUS_LABELS,
  MATERIAL_REQUEST_TITLE,
  canTransitionMaterialRequest,
  deriveMaterialRequestFulfillment,
  isMaterialRequestFulfillable,
} from "../material-request"

describe("deriveMaterialRequestFulfillment", () => {
  it("belum ada diterima -> disetujui, sisa penuh", () => {
    const r = deriveMaterialRequestFulfillment({
      requested: [{ itemId: 1, qty: 10 }],
      receivedLines: [],
    })
    expect(r.status).toBe("disetujui")
    expect(r.lines).toEqual([
      { itemId: 1, requestedQty: 10, receivedQty: 0, remainingQty: 10 },
    ])
  })

  it("dua transfer diterima bertahap menutup penuh -> terpenuhi (AC-MR-3)", () => {
    const r = deriveMaterialRequestFulfillment({
      requested: [{ itemId: 1, qty: 10 }],
      receivedLines: [
        { itemId: 1, qty: 4 },
        { itemId: 1, qty: 6 },
      ],
    })
    expect(r.status).toBe("terpenuhi")
    expect(r.lines[0].remainingQty).toBe(0)
  })

  it("sebagian diterima -> terpenuhi_sebagian + sisa benar (AC-MR-4 versi bertahap)", () => {
    const r = deriveMaterialRequestFulfillment({
      requested: [
        { itemId: 1, qty: 10 },
        { itemId: 2, qty: 5 },
      ],
      receivedLines: [{ itemId: 1, qty: 10 }],
    })
    expect(r.status).toBe("terpenuhi_sebagian")
    expect(r.lines.find((l) => l.itemId === 2)).toMatchObject({
      receivedQty: 0,
      remainingQty: 5,
    })
  })

  it("diterima melebihi diminta di-cap ke diminta", () => {
    const r = deriveMaterialRequestFulfillment({
      requested: [{ itemId: 1, qty: 3 }],
      receivedLines: [{ itemId: 1, qty: 9 }],
    })
    expect(r.lines[0].receivedQty).toBe(3)
    expect(r.status).toBe("terpenuhi")
  })
})

describe("label + transisi", () => {
  it("kata tampil §6 verbatim", () => {
    expect(MATERIAL_REQUEST_TITLE).toBe("Permintaan Antar Gudang")
    expect(MATERIAL_REQUEST_STATUS_LABELS).toEqual({
      draft: "Draft",
      diajukan: "Diajukan",
      disetujui: "Disetujui",
      ditolak: "Ditolak",
      terpenuhi: "Terpenuhi",
      terpenuhi_sebagian: "Terpenuhi Sebagian",
      ditutup_manual: "Ditutup Manual",
      dibatalkan: "Dibatalkan",
    })
  })

  it("matriks transisi manual §3", () => {
    expect(canTransitionMaterialRequest("draft", "diajukan")).toBe(true)
    expect(canTransitionMaterialRequest("diajukan", "disetujui")).toBe(true)
    expect(canTransitionMaterialRequest("draft", "disetujui")).toBe(false)
    expect(canTransitionMaterialRequest("ditolak", "diajukan")).toBe(false)
    expect(canTransitionMaterialRequest("terpenuhi", "ditutup_manual")).toBe(false)
    expect(isMaterialRequestFulfillable("disetujui")).toBe(true)
    expect(isMaterialRequestFulfillable("ditutup_manual")).toBe(false)
  })
})
