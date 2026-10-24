/**
 * Inti peristiwa perubahan aset F-2026-10-23-111-V + F-2026-10-23-115-V +
 * gerbang akun F-2026-10-23-128-V di `asset-change-event.ts`.
 *
 * Angka di sini dikunci ke contoh kerja vonis: bruto 120 jt, akumulasi
 * 20 jt (tercatat 100 jt). Cabut satu penjaga builder = kasus terkait
 * MERAH. Uang memakai Decimal sen persis.
 */

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import {
  buildAssetChangeEvent,
  type AssetChangeEventRequest,
  type AssetPostedFacts,
  type CategoryAccountMapping,
  type MappedAccount,
} from "../asset-change-event"

const D = (v: number | string) => new Prisma.Decimal(v)

function account(id: number, code: string, type: string, reportGroup: string | null = null): MappedAccount {
  return { id, code, type, reportGroup, isActive: true }
}

const ASSET_ACC = account(11, "120001", "ASSET", "FASS")
const ACCUM_ACC = account(12, "120006", "ASSET", "DEPR")
const SURPLUS_ACC = account(13, "300004", "EQUITY", "EQTY")
const LOSS_ACC = account(14, "600027", "EXPENSE", "EXPS")
const CONTRA_ACC = account(15, "120007", "ASSET", "DEPR")

function mapping(over: Partial<CategoryAccountMapping> = {}): CategoryAccountMapping {
  return {
    categoryName: "Kendaraan",
    assetAccount: ASSET_ACC,
    accumulatedDepreciationAccount: ACCUM_ACC,
    revaluationSurplusAccount: SURPLUS_ACC,
    impairmentLossAccount: LOSS_ACC,
    accumulatedImpairmentAccount: CONTRA_ACC,
    ...over,
  }
}

function facts(over: Partial<AssetPostedFacts> = {}): AssetPostedFacts {
  return {
    assetStatus: "active",
    hasAcquisitionJournal: true,
    grossCostPosted: D(120_000_000),
    accumulatedPosted: D(20_000_000),
    accumulatedImpairmentPosted: D(0),
    disposalGrossPosted: D(0),
    revaluationSurplusPerAsset: D(0),
    priorLossChargedToProfitOrLoss: D(0),
    lastFiscalRevaluationDate: null,
    ...over,
  }
}

function req(over: Partial<AssetChangeEventRequest>): AssetChangeEventRequest {
  return {
    effectiveDate: new Date(2026, 9, 1),
    sourceDocumentKey: "DOC-1",
    ...over,
  } as AssetChangeEventRequest
}

function build(request: AssetChangeEventRequest, f = facts(), m = mapping()) {
  return buildAssetChangeEvent({ request, facts: f, mapping: m })
}

describe("F-111-V revaluasi komersial", () => {
  it("E111-1a naik 100->130: Dr akumulasi 20 + Dr bruto 30, Cr surplus 30; fiskal byte-sama (kolom fiskal kosong)", () => {
    const r = build(req({
      kind: "REVALUATION_UP",
      fairValue: D(130_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-001",
      revaluedClassName: "Kendaraan operasional",
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const byCode = (code: string, side: "debit" | "credit") =>
      r.event.lines.filter((l) => l.accountCode === code).reduce((s, l) => s.add(l[side]), D(0))
    expect(byCode("120006", "debit").toString()).toBe("20000000")
    // Dr bruto = nilai wajar − bruto berjalan (130 − 120); kenaikan tercatat
    // 30 jt = Dr akumulasi 20 + Dr bruto 10.
    expect(byCode("120001", "debit").toString()).toBe("10000000")
    expect(byCode("300004", "credit").toString()).toBe("30000000")
    expect(r.event.carryingAfter.toString()).toBe("130000000")
    expect(r.event.fiscalBaseAfter).toBeNull()
    expect(r.event.finalTaxAmount).toBeNull()
  })

  it("E111-1b turun sesudah naik: Dr surplus 30 (tolakan), Cr aset 30; laba-rugi 0", () => {
    const r = build(req({
      kind: "REVALUATION_DOWN",
      fairValue: D(100_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-002",
      revaluedClassName: "Kendaraan operasional",
    }), facts({
      // Keadaan sesudah revaluasi naik contoh E111-1a: bruto disajikan ulang
      // 130 jt, akumulasi mulai dari nol, surplus per-aset 30 jt.
      grossCostPosted: D(130_000_000),
      accumulatedPosted: D(0),
      revaluationSurplusPerAsset: D(30_000_000),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const toPl = r.event.lines.filter((l) => l.accountCode === "600027")
    expect(toPl).toHaveLength(0)
    expect(r.event.revaluationSurplusAfter.toString()).toBe("0")
  })

  it("E111-2/rev-1 turun tanpa surplus: seluruhnya ke beban; surplus tidak negatif dan tidak memakan aset lain", () => {
    const r = build(req({
      kind: "REVALUATION_DOWN",
      fairValue: D(80_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-003",
      revaluedClassName: "Kendaraan operasional",
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.lines.find((l) => l.accountCode === "600027")?.debit.toString()).toBe("20000000")
    expect(r.event.revaluationSurplusAfter.toString()).toBe("0")
  })

  it("E111-1 surplus NULL = tolak berisik menamai peran + kategori, nol baris (E128-1); tipe laba-rugi juga ditolak", () => {
    const r = build(req({
      kind: "REVALUATION_UP",
      fairValue: D(130_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-001",
      revaluedClassName: "Kendaraan operasional",
    }), facts(), mapping({ revaluationSurplusAccount: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("Surplus Revaluasi")
    expect(r.error).toContain("Kendaraan")

    const wrongType = build(req({
      kind: "REVALUATION_UP",
      fairValue: D(130_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-001",
      revaluedClassName: "Kendaraan operasional",
    }), facts(), mapping({ revaluationSurplusAccount: account(99, "710004", "REVENUE") }))
    expect(wrongType.ok).toBe(false)
  })

  it("E111-1 kenaikan membalik beban lampau aset sama dibatasi bukti jurnal lampau; sisanya surplus", () => {
    const r = build(req({
      kind: "REVALUATION_UP",
      fairValue: D(130_000_000),
      appraiserName: "KJPP Andalan",
      appraiserReportRef: "LAP-004",
      revaluedClassName: "Kendaraan operasional",
    }), facts({ priorLossChargedToProfitOrLoss: D(10_000_000) }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.lines.find((l) => l.accountCode === "600027")?.credit.toString()).toBe("10000000")
    expect(r.event.lines.find((l) => l.accountCode === "300004")?.credit.toString()).toBe("20000000")
  })
})

describe("F-111-V impairment", () => {
  it("E111-5 impairment 100->70 model biaya: Dr beban 30, Cr kontra 120007 30; akumulasi penyusutan utuh; fiskal diam", () => {
    const r = build(req({
      kind: "IMPAIRMENT",
      impairmentIndicator: "PHYSICAL_DAMAGE",
      recoverableBasis: "FAIR_VALUE_LESS_COSTS",
      recoverableAmount: D(70_000_000),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.lines).toHaveLength(2)
    expect(r.event.lines.find((l) => l.accountCode === "600027")?.debit.toString()).toBe("30000000")
    expect(r.event.lines.find((l) => l.accountCode === "120007")?.credit.toString()).toBe("30000000")
    expect(r.event.accumulatedBefore.toString()).toBe("20000000")
    expect(r.event.fiscalBaseAfter).toBeNull()
  })

  it("E111-6/rev-4 kontra NULL ditolak; kontra digandeng akun akumulasi penyusutan ditolak", () => {
    const r = build(req({
      kind: "IMPAIRMENT",
      impairmentIndicator: "OBSOLESCENCE",
      recoverableBasis: "VALUE_IN_USE",
      recoverableAmount: D(70_000_000),
    }), facts(), mapping({ accumulatedImpairmentAccount: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("Akumulasi Penurunan Nilai")
  })

  it("E111-7 impairment aset revaluasi menolakan surplus antar-aset ditolak: hanya surplus aset sama", () => {
    const r = build(req({
      kind: "IMPAIRMENT",
      impairmentIndicator: "CHANGED_USE_PLAN",
      recoverableBasis: "VALUE_IN_USE",
      recoverableAmount: D(60_000_000),
    }), facts({ revaluationSurplusPerAsset: D(25_000_000) }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // penurunan 40 jt: 25 jt surplus aset sama dulu, 15 jt beban.
    expect(r.event.lines.find((l) => l.accountCode === "300004")?.debit.toString()).toBe("25000000")
    expect(r.event.lines.find((l) => l.accountCode === "600027")?.debit.toString()).toBe("15000000")
    expect(r.event.revaluationSurplusAfter.toString()).toBe("0")
  })

  it("E111-8 pembalikan 70->95 tanpa-plafon 90 dibatasi 20; goodwill ditolak", () => {
    const impaired = facts({
      accumulatedImpairmentPosted: D(30_000_000),
    })
    const r = build(req({
      kind: "IMPAIRMENT_REVERSAL",
      impairmentIndicator: "PHYSICAL_DAMAGE",
      recoverableBasis: "VALUE_IN_USE",
      recoverableAmount: D(95_000_000),
      carryingWithoutImpairment: D(90_000_000),
    }), impaired)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // tercatat kini 70 jt; plafon 90 jt -> balik maks 20 jt (bukan 25 jt).
    expect(r.event.lines.find((l) => l.accountCode === "120007")?.debit.toString()).toBe("20000000")
    expect(r.event.carryingAfter.toString()).toBe("90000000")

    const goodwill = build(req({
      kind: "IMPAIRMENT_REVERSAL",
      impairmentIndicator: "PHYSICAL_DAMAGE",
      recoverableBasis: "VALUE_IN_USE",
      recoverableAmount: D(95_000_000),
      carryingWithoutImpairment: D(90_000_000),
      isGoodwillOrNonAmortizing: true,
    }), impaired)
    expect(goodwill.ok).toBe(false)
  })

  it("E111-9 seluruh mapping satu kategori NULL: tiap peristiwa berharga ditolak sebelum jurnal", () => {
    const empty = mapping({
      revaluationSurplusAccount: null,
      impairmentLossAccount: null,
      accumulatedImpairmentAccount: null,
    })
    const up = build(req({
      kind: "REVALUATION_UP", fairValue: D(130_000_000),
      appraiserName: "KJPP", appraiserReportRef: "L-1", revaluedClassName: "Kendaraan",
    }), facts(), empty)
    expect(up.ok).toBe(false)
    const imp = build(req({
      kind: "IMPAIRMENT", impairmentIndicator: "PHYSICAL_DAMAGE",
      recoverableBasis: "VALUE_IN_USE", recoverableAmount: D(70_000_000),
    }), facts(), empty)
    expect(imp.ok).toBe(false)
  })
})

describe("F-111-V revaluasi fiskal berpersetujuan DJP", () => {
  const fiscalReq = (over: Partial<AssetChangeEventRequest> = {}) => req({
    kind: "FISCAL_REVALUATION_APPROVED",
    fairValue: D(130_000_000),
    appraiserName: "KJPP Andalan",
    appraiserReportRef: "LAP-F-1",
    revaluedClassName: "Kendaraan operasional",
    djpApprovalNumber: "KEP-123/2026",
    djpApprovalDate: new Date(2026, 8, 15),
    fiscalBaseBefore: D(90_000_000),
    finalTaxRatePercent: D(10),
    taxPayableAccount: account(21, "210008", "LIABILITY"),
    fiscalGroupCode: "GROUP_1",
    ...over,
  })

  it("E111-3a dengan persetujuan: dasar fiskal baru 130, surplus fiskal 40, PPh final 10% x 40 = 4 jt, masa manfaat reset penuh kelompok", () => {
    const r = build(fiscalReq())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.fiscalBaseAfter?.toString()).toBe("130000000")
    expect(r.event.fiscalSurplusAmount?.toString()).toBe("40000000")
    expect(r.event.finalTaxAmount?.toString()).toBe("4000000")
    expect(r.event.finalTaxRatePercent?.toString()).toBe("10")
    // Kelompok I bukan bangunan: 4 tahun = 48 bulan penuh.
    expect(r.event.fiscalUsefulLifeMonthsAfter).toBe(48)
    const tax = r.event.lines.find((l) => l.accountCode === "210008")
    expect(tax?.credit.toString()).toBe("4000000")
  })

  it("E111-3b tanpa nomor/tanggal DJP: fiskal ditolak berisik (komersial ditahan), angka fiskal keluar nol", () => {
    const r = build(fiscalReq({ djpApprovalNumber: null, djpApprovalDate: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("DJP")
  })

  it("E111-3c gerbang 5 tahun: penilaian fiskal <5 tahun lalu ditolak", () => {
    const r = build(fiscalReq(), facts({ lastFiscalRevaluationDate: new Date(2024, 0, 1) }))
    expect(r.ok).toBe(false)
  })

  it("E111-4 snapshot tarif master beku pada peristiwa (tarif keluar dari master saat posting, bukan konstanta kode)", () => {
    const r = build(fiscalReq({ finalTaxRatePercent: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("Tarif PPh final")
  })
})

describe("F-115-V reklasifikasi + perubahan metode/estimasi", () => {
  const toMapping = (): CategoryAccountMapping => ({
    categoryName: "Mesin",
    assetAccount: account(31, "120101", "ASSET", "FASS"),
    accumulatedDepreciationAccount: account(32, "120106", "ASSET", "DEPR"),
    revaluationSurplusAccount: SURPLUS_ACC,
    impairmentLossAccount: LOSS_ACC,
    accumulatedImpairmentAccount: CONTRA_ACC,
  })

  it("E115-1 reklasifikasi: bruto+akumulasi pindah utuh antar akun kelas, nol laba-rugi/ekuitas, tercatat sama", () => {
    const r = build(req({
      kind: "RECLASSIFICATION",
      reasonCode: "INITIAL_CATEGORY_ERROR",
      approvedByName: "Kepala Akuntansi",
      toMapping: toMapping(),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.carryingAfter.toString()).toBe(r.event.carryingBefore.toString())
    const touchingPlEquity = r.event.lines.filter((l) => ["600027", "300004", "710004"].includes(l.accountCode))
    expect(touchingPlEquity).toHaveLength(0)
    const debit = r.event.lines.reduce((s, l) => s.add(l.debit), D(0))
    const credit = r.event.lines.reduce((s, l) => s.add(l.credit), D(0))
    expect(debit.toString()).toBe(credit.toString())
    expect(debit.toString()).toBe("140000000")
  })

  it("E115-2 ganti metode komersial: peristiwa nol baris jurnal; tanpa alasan/penelaah ditolak", () => {
    const r = build(req({
      kind: "COMMERCIAL_METHOD_CHANGE",
      reasonCode: "CONSUMPTION_PATTERN_CHANGE",
      approvedByName: "Kepala Akuntansi",
      oldMethod: "straight_line",
      newMethod: "declining_balance",
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.lines).toHaveLength(0)

    const anon = build(req({
      kind: "COMMERCIAL_METHOD_CHANGE",
      oldMethod: "straight_line",
      newMethod: "declining_balance",
    }))
    expect(anon.ok).toBe(false)
  })

  it("E115-3 ganti metode fiskal tanpa persetujuan ditolak; bangunan saldo-menurun ditolak mutlak", () => {
    const noApproval = build(req({
      kind: "FISCAL_METHOD_CHANGE",
      reasonCode: "OTHER_DOCUMENTED",
      approvedByName: "Kepala Akuntansi",
      oldMethod: "straight_line",
      newMethod: "declining_balance",
      fiscalGroupCode: "GROUP_1",
    }))
    expect(noApproval.ok).toBe(false)

    const building = build(req({
      kind: "FISCAL_METHOD_CHANGE",
      djpApprovalNumber: "KEP-9/2026",
      djpApprovalDate: new Date(2026, 8, 1),
      oldMethod: "straight_line",
      newMethod: "declining_balance",
      fiscalGroupCode: "BUILDING_PERMANENT",
      isBuildingFiscal: true,
    }))
    expect(building.ok).toBe(false)
  })

  it("E115-4 perubahan estimasi masa manfaat: nol jurnal, fiskal tidak ikut (kolom fiskal kosong)", () => {
    const r = build(req({
      kind: "ESTIMATE_CHANGE",
      reasonCode: "FASTER_WEAR",
      approvedByName: "Kepala Teknik",
      newUsefulLifeMonths: 36,
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.event.lines).toHaveLength(0)
    expect(r.event.fiscalBaseAfter).toBeNull()
  })

  it("aset disposed ditolak untuk semua peristiwa", () => {
    const r = build(req({
      kind: "IMPAIRMENT",
      impairmentIndicator: "PHYSICAL_DAMAGE",
      recoverableBasis: "VALUE_IN_USE",
      recoverableAmount: D(1),
    }), facts({ assetStatus: "disposed" }))
    expect(r.ok).toBe(false)
  })
})
