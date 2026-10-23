import { describe, it, expect } from "vitest"

/**
 * Builder saran substitusi F-2026-10-22-069-S (AC-SUB69-2/7/8).
 * Yang dijaga:
 * - hanya relasi LANGSUNG tampil; transitif karangan (A->B, B->C lalu
 *   A ditawari C) tidak pernah muncul (AC-SUB69-8);
 * - syarat tampil BR-SUB69-03: menunggu/dipesan ATAU shortage > 0;
 *   baris ter-issue, terpasang, diganti, dan jasa tidak dapat saran;
 * - incompatible tampil sebagai ditolak dengan alasan verbatim
 *   (AC-SUB69-7), bukan disembunyikan;
 * - pengganti yang stoknya juga kurang ditandai apa adanya tanpa
 *   rantai saran tingkat dua.
 */

import {
  buildSubstituteSuggestions,
  type SubstituteCandidateInput,
  type SubstituteSuggestionLineInput,
} from "../item-substitute-suggestions"

function line(over: Partial<SubstituteSuggestionLineInput> = {}): SubstituteSuggestionLineInput {
  return {
    workOrderItemId: 11,
    itemId: 1,
    description: null,
    qty: 4,
    partStatus: "menunggu",
    issuedQty: 0,
    shortageQty: 4,
    ...over,
  }
}

function candidate(over: Partial<SubstituteCandidateInput> = {}): SubstituteCandidateInput {
  return {
    substituteId: 100,
    itemId: 1,
    substituteItemId: 2,
    substituteName: "Pengganti B",
    substituteSku: "SKU-B",
    substituteUnitOfMeasure: "PCS",
    notes: null,
    effectiveAvailableQty: 10,
    fitment: "compatible",
    fitmentReason: "Cocok menurut aturan fitment.",
    ...over,
  }
}

describe("buildSubstituteSuggestions", () => {
  it("baris menunggu + shortage dapat saran langsung dengan stok efektif server", () => {
    const r = buildSubstituteSuggestions({ lines: [line()], candidates: [candidate()] })
    expect(r.suggestedLineCount).toBe(1)
    expect(r.rows[0].suggestions).toHaveLength(1)
    expect(r.rows[0].suggestions[0]).toMatchObject({
      substituteItemId: 2,
      effectiveAvailableQty: 10,
      substituteShortage: false,
      rejected: false,
    })
    expect(r.notice).toContain("tidak transitif")
  })

  it("AC-SUB69-8: transitif karangan tidak ditawarkan (A->B, B->C; A tidak ditawari C)", () => {
    const r = buildSubstituteSuggestions({
      lines: [line()],
      candidates: [
        candidate(),
        candidate({ substituteId: 101, itemId: 2, substituteItemId: 3, substituteName: "C", substituteSku: "SKU-C" }),
      ],
    })
    const offered = r.rows[0].suggestions.map((s) => s.substituteItemId)
    expect(offered).toEqual([2])
    expect(offered).not.toContain(3)
  })

  it("baris ter-issue sebagian tidak pernah dapat saran (AC-SUB69-2)", () => {
    const r = buildSubstituteSuggestions({
      lines: [line({ partStatus: "terpasang-sebagian", issuedQty: 1, shortageQty: 3 })],
      candidates: [candidate()],
    })
    expect(r.rows[0].suggestions).toEqual([])
    expect(r.suggestedLineCount).toBe(0)
  })

  it("baris diganti, terpasang, dan jasa tidak dapat saran ulang", () => {
    const r = buildSubstituteSuggestions({
      lines: [
        line({ workOrderItemId: 1, partStatus: "diganti" }),
        line({ workOrderItemId: 2, partStatus: "terpasang", issuedQty: 4, shortageQty: 0 }),
        line({ workOrderItemId: 3, itemId: 0, partStatus: "tak-tertaut", shortageQty: 0 }),
        line({ workOrderItemId: 4, partStatus: "datang", shortageQty: 0 }),
      ],
      candidates: [candidate()],
    })
    expect(r.rows.every((row) => row.suggestions.length === 0)).toBe(true)
  })

  it("status datang tetapi stok efektif kurang tetap dapat saran (shortage > 0)", () => {
    const r = buildSubstituteSuggestions({
      lines: [line({ partStatus: "datang", shortageQty: 2 })],
      candidates: [candidate()],
    })
    expect(r.rows[0].suggestions).toHaveLength(1)
  })

  it("AC-SUB69-7: incompatible tampil ditolak dengan alasan verbatim, tidak disembunyikan", () => {
    const r = buildSubstituteSuggestions({
      lines: [line()],
      candidates: [
        candidate({ fitment: "incompatible", fitmentReason: "Tidak cocok menurut aturan fitment." }),
      ],
    })
    expect(r.rows[0].suggestions).toHaveLength(1)
    expect(r.rows[0].suggestions[0]).toMatchObject({
      fitment: "incompatible",
      fitmentReason: "Tidak cocok menurut aturan fitment.",
      rejected: true,
    })
  })

  it("pengganti stoknya juga kurang ditandai substituteShortage apa adanya", () => {
    const r = buildSubstituteSuggestions({
      lines: [line({ qty: 4 })],
      candidates: [candidate({ effectiveAvailableQty: 1 })],
    })
    expect(r.rows[0].suggestions[0].substituteShortage).toBe(true)
  })

  it("baris tanpa relasi langsung tetap tampil dengan saran kosong", () => {
    const r = buildSubstituteSuggestions({ lines: [line()], candidates: [] })
    expect(r.rows[0].suggestions).toEqual([])
    expect(r.suggestedLineCount).toBe(0)
  })
})
