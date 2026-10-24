import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"

import {
  classifyCronDisposition,
  isRegisteredAssetUseStatus,
  summarizeAssetUseFlags,
  validateHeldForSaleFacts,
} from "../asset-use-status"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-23-117-V (lapis aman builder):
 * Putusan 1-4. Cabut daftar terdaftar, saklar menganggur, gerbang
 * 5 fakta, atau alasan fiskal dan tes ini MERAH.
 */

const ALL_FACTS = {
  managementApproval: "Direktur 2026-10-01",
  availableForImmediateSale: true,
  activeBuyerSearchRef: "PEN-2026-001",
  saleExpectedWithin12Months: true,
  askingPriceReasonable: true,
} as const

describe("daftar status terdaftar — Putusan 1 (E117-1)", () => {
  it("hanya active/held_for_sale/disposed sah", () => {
    for (const s of ["active", "held_for_sale", "disposed"]) {
      expect(isRegisteredAssetUseStatus(s)).toBe(true)
    }
    for (const s of ["inactive", "idle", "nonaktif", "rusak", "", null, undefined]) {
      expect(isRegisteredAssetUseStatus(s as string)).toBe(false)
    }
  })

  it("E117-1: status karangan = skip beralasan unregistered-status, fiskal tidak dibungkam", () => {
    const r = classifyCronDisposition({
      status: "inactive",
      bookValue: "5000000",
      residualValue: "0",
    })
    expect(r).toEqual({
      action: "skip",
      reason: "unregistered-status",
      fiscalContinues: true,
    })
  })
})

describe("gerbang held_for_sale 5 fakta — Putusan 3 (E117-3)", () => {
  it("lima fakta terisi = classify", () => {
    expect(validateHeldForSaleFacts({ ...ALL_FACTS })).toEqual({
      decision: "classify",
    })
  })

  it("E117-3: satu fakta kosong = reject bernama, daftar lengkap urut", () => {
    expect(
      validateHeldForSaleFacts({
        managementApproval: "  ",
        availableForImmediateSale: false,
        activeBuyerSearchRef: null,
        saleExpectedWithin12Months: null,
        askingPriceReasonable: undefined,
      }),
    ).toEqual({
      decision: "reject",
      missingFacts: ["a", "b", "c", "d", "e"],
    })
    const partial = validateHeldForSaleFacts({
      ...ALL_FACTS,
      saleExpectedWithin12Months: false,
    })
    expect(partial).toEqual({ decision: "reject", missingFacts: ["d"] })
  })
})

describe("disposisi cron — Putusan 2/3/4 (E117-2, E117-4)", () => {
  const base = { bookValue: "5000000", residualValue: "100000" }

  it("active normal = process", () => {
    expect(classifyCronDisposition({ status: "active", ...base })).toEqual({
      action: "process",
      reason: null,
      fiscalContinues: true,
    })
  })

  it("E117-2: menganggur tetap process (penanda bukan saklar)", () => {
    expect(
      classifyCronDisposition({ status: "active", idleActive: true, ...base }),
    ).toEqual({ action: "process", reason: null, fiscalContinues: true })
  })

  it("E117-4: held_for_sale skip komersial alasan terhitung, fiskal tetap berjalan", () => {
    expect(classifyCronDisposition({ status: "held_for_sale", ...base })).toEqual({
      action: "skip",
      reason: "held-for-sale",
      fiscalContinues: true,
    })
  })

  it("disposed skip, fiskal berhenti (disposal F-116-V)", () => {
    expect(classifyCronDisposition({ status: "disposed", ...base })).toEqual({
      action: "skip",
      reason: "disposed",
      fiscalContinues: false,
    })
  })

  it("Putusan 4: active at-residual skip karena nilai, bukan status", () => {
    expect(
      classifyCronDisposition({
        status: "active",
        bookValue: "100000",
        residualValue: "100000",
      }),
    ).toEqual({ action: "skip", reason: "at-residual", fiscalContinues: true })
  })

  it("status null diperlakukan default active existing", () => {
    expect(classifyCronDisposition({ status: null, ...base }).action).toBe(
      "process",
    )
  })
})

describe("penanda registry — Putusan 4 (E117-7)", () => {
  it("tersusutkan-penuh-masih-dipakai terhitung + bruto; tak terdaftar bernama", () => {
    const s = summarizeAssetUseFlags([
      { assetId: 1, status: "active", bookValue: "0", residualValue: "0", purchaseCost: "10000000" },
      { assetId: 2, status: "active", idleActive: true, bookValue: "100", residualValue: "100", purchaseCost: "20000000" },
      { assetId: 3, status: "active", bookValue: "500", residualValue: "100", purchaseCost: "30000000" },
      { assetId: 4, status: "held_for_sale", bookValue: "500", residualValue: "100", purchaseCost: "40000000" },
      { assetId: 5, status: "inactive", bookValue: "0", residualValue: "0", purchaseCost: "50000000" },
      { assetId: 6, status: "disposed", bookValue: "0", residualValue: "0", purchaseCost: "60000000" },
    ])
    expect(s.fullyDepreciatedInUseCount).toBe(2)
    expect(s.fullyDepreciatedInUseGross).toEqual(new Prisma.Decimal("30000000"))
    expect(s.idleCount).toBe(1)
    expect(s.heldForSaleCount).toBe(1)
    expect(s.unregisteredStatusAssetIds).toEqual([5])
  })
})
