import { describe, expect, it } from "vitest"

import {
  buildForwardTrace,
  completedByLabel,
  genealogyMaterialTokens,
  type GenealogyTraceInput,
} from "@/lib/reports/genealogy-forward-trace"

function genealogy(over: Partial<GenealogyTraceInput> = {}): GenealogyTraceInput {
  return {
    productionOrderId: 1,
    productionOrderDocumentNo: "PO-0001",
    productionOrderSlug: "po-0001",
    documentNo: "PG-0001",
    outputItemId: 10,
    outputQty: 2,
    outputSerials: ["OUT-1", "OUT-2"],
    outputBatch: "B-OUT",
    completedAt: new Date("2026-10-12T00:00:00"),
    completedBy: 7,
    materials: [
      { itemId: 20, serialNumbers: ["RAW-A"], batchNumber: "LOT-1, LOT-2" },
      { itemId: 21, serialNumbers: null, batchNumber: null },
    ],
    ...over,
  }
}

describe("genealogyMaterialTokens", () => {
  it("memecah batch tergabung koma dan menggabungkan serial", () => {
    expect(genealogyMaterialTokens({ itemId: 1, serialNumbers: ["SN-1"], batchNumber: "LOT-1, LOT-2" })).toEqual([
      "LOT-1",
      "LOT-2",
      "SN-1",
    ])
  })

  it("mengabaikan serial non-array dan batch kosong", () => {
    expect(genealogyMaterialTokens({ itemId: 1, serialNumbers: "SN-1", batchNumber: null })).toEqual([])
  })
})

describe("buildForwardTrace", () => {
  it("menemukan order tujuan dari lot bahan yang dipakai", () => {
    const hits = buildForwardTrace({ genealogies: [genealogy()], query: "LOT-2" })
    expect(hits).toHaveLength(1)
    expect(hits[0].productionOrderId).toBe(1)
    expect(hits[0].productionOrderDocumentNo).toBe("PO-0001")
    expect(hits[0].matchedTokens).toEqual(["LOT-2"])
    expect(hits[0].matchedItemIds).toEqual([20])
    expect(hits[0].outputSerials).toEqual(["OUT-1", "OUT-2"])
  })

  it("menemukan order tujuan dari serial bahan (case-insensitive)", () => {
    const hits = buildForwardTrace({ genealogies: [genealogy()], query: " raw-a " })
    expect(hits).toHaveLength(1)
    expect(hits[0].matchedTokens).toEqual(["RAW-A"])
  })

  it("tidak menemukan order yang tidak terkait", () => {
    expect(buildForwardTrace({ genealogies: [genealogy()], query: "LOT-99" })).toEqual([])
  })

  it("tidak mencocokkan awalan token (LOT-1 tidak menunjuk pemakai LOT-10)", () => {
    const other = genealogy({
      productionOrderId: 2,
      materials: [{ itemId: 22, serialNumbers: null, batchNumber: "LOT-10" }],
    })
    expect(buildForwardTrace({ genealogies: [other], query: "LOT-1" })).toEqual([])
  })

  it("kueri kosong menghasilkan tidak ada hasil", () => {
    expect(buildForwardTrace({ genealogies: [genealogy()], query: "  " })).toEqual([])
  })

  it("mengurutkan hasil dari penyelesaian terbaru", () => {
    const older = genealogy()
    const newer = genealogy({
      productionOrderId: 3,
      productionOrderDocumentNo: "PO-0003",
      completedAt: new Date("2026-10-20T00:00:00"),
    })
    const hits = buildForwardTrace({ genealogies: [older, newer], query: "LOT-1" })
    expect(hits.map((h) => h.productionOrderId)).toEqual([3, 1])
  })
})

describe("completedByLabel", () => {
  it("menampilkan nama pengguna bila terisi dan dikenal", () => {
    expect(completedByLabel(7, new Map([[7, "Budi Operator"]]))).toBe("Budi Operator")
  })

  it("jatuh ke penanda id bila user sudah tidak ada, dan null bila belum terisi", () => {
    expect(completedByLabel(9, new Map())).toBe("Pengguna #9")
    expect(completedByLabel(null, new Map())).toBeNull()
  })
})
