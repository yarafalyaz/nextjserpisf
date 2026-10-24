import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"

import {
  isRegisteredAcquisitionType,
  resolveAssetAcquisition,
  type AssetAcquisitionInput,
} from "../asset-acquisition"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-23-120-V (lapis aman builder):
 * jenis terdaftar + lawan kredit + dasar fiskal Pasal 10 + gerbang
 * dokumen/penilai/mapping + PPN faktur-tertaut. Cabut satu gerbang dan
 * tes subset E120 terkait MERAH.
 */

const D = (v: string) => new Prisma.Decimal(v)

const CASH: AssetAcquisitionInput = {
  acquisitionType: "CASH_PURCHASE",
  purchaseCost: D("50000000.00"),
  sourceDocumentRef: null,
  isRelatedParty: false,
  marketValue: null,
  marketValueAssessor: null,
  grantIsExempt: null,
  grantorFiscalBookValue: null,
  surrenderedAssetCarryingAmount: null,
  hasLinkedTaxInvoice: false,
  linkedInputVatAmount: null,
  counterpartMapped: null,
}

const CREDIT: AssetAcquisitionInput = {
  ...CASH,
  acquisitionType: "CREDIT_PURCHASE",
  sourceDocumentRef: "INV-VENDOR-001",
  counterpartMapped: true,
}

describe("jenis terdaftar (E120-2)", () => {
  it("lima jenis terdaftar dikenal; teks bebas/kosong tidak", () => {
    for (const t of [
      "CASH_PURCHASE",
      "CREDIT_PURCHASE",
      "GRANT_DONATION",
      "CAPITAL_CONTRIBUTION",
      "EXCHANGE",
    ]) {
      expect(isRegisteredAcquisitionType(t)).toBe(true)
    }
    for (const t of ["tunai", "hibah", "", null, undefined]) {
      expect(isRegisteredAcquisitionType(t)).toBe(false)
    }
  })

  it("E120-2: perolehan berharga jenis kosong/teks bebas ditolak", () => {
    for (const t of ["", "lainnya", null, undefined]) {
      expect(resolveAssetAcquisition({ ...CASH, acquisitionType: t })).toEqual({
        status: "reject",
        reason: "unregistered-acquisition-type",
      })
    }
  })

  it("purchaseCost 0 warisan = no-journal, jenis tidak dipaksa (P4)", () => {
    expect(
      resolveAssetAcquisition({ ...CASH, purchaseCost: D("0"), acquisitionType: null }),
    ).toEqual({ status: "no-journal", reason: "zero-cost-legacy" })
  })
})

describe("lawan kredit per jenis (E120-1, E120-5, E120-7)", () => {
  it("CASH persis existing: cash-bank, dasar fiskal harga sesungguhnya", () => {
    const r = resolveAssetAcquisition(CASH)
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.counterpartKind).toBe("cash-bank")
    expect(r.fiscalBasis.toFixed(2)).toBe("50000000.00")
    expect(r.fiscalBasisSource).toBe("actual-price")
    expect(r.fiscalDepreciable).toBe(true)
  })

  it("E120-1: CREDIT lawan accounts-payable, bukan kas", () => {
    const r = resolveAssetAcquisition(CREDIT)
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.counterpartKind).toBe("accounts-payable")
  })

  it("E120-5: setoran modal lawan equity, bukan pendapatan/kas", () => {
    const r = resolveAssetAcquisition({
      ...CASH,
      acquisitionType: "CAPITAL_CONTRIBUTION",
      sourceDocumentRef: "BA-SETORAN-01",
      counterpartMapped: true,
      marketValue: D("80000000.00"),
      marketValueAssessor: "KJPP Contoh (laporan 01/2026)",
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.counterpartKind).toBe("equity")
    expect(r.fiscalBasis.toFixed(2)).toBe("80000000.00")
    expect(r.fiscalBasisSource).toBe("market-value")
  })

  it("dokumen sumber wajib non-kas (P3); tunai tidak diperketat surut", () => {
    expect(
      resolveAssetAcquisition({ ...CREDIT, sourceDocumentRef: "  " }),
    ).toEqual({ status: "reject", reason: "missing-source-document" })
    expect(resolveAssetAcquisition(CASH).status).toBe("resolved")
  })

  it("E120-7: mapping lawan kosong = ditolak berisik", () => {
    expect(
      resolveAssetAcquisition({ ...CREDIT, counterpartMapped: false }),
    ).toEqual({ status: "reject", reason: "missing-counterpart-account" })
    expect(
      resolveAssetAcquisition({ ...CREDIT, counterpartMapped: null }),
    ).toEqual({ status: "reject", reason: "missing-counterpart-account" })
  })
})

describe("dasar fiskal Pasal 10 (E120-3, E120-4, E120-10)", () => {
  it("E120-10: pihak berelasi tanpa harga pasar bernama ditolak; dengan penilai dasar = pasar", () => {
    expect(resolveAssetAcquisition({ ...CREDIT, isRelatedParty: true })).toEqual({
      status: "reject",
      reason: "missing-market-value",
    })
    expect(
      resolveAssetAcquisition({
        ...CREDIT,
        isRelatedParty: true,
        marketValue: D("60000000.00"),
      }),
    ).toEqual({ status: "reject", reason: "missing-assessor" })
    const r = resolveAssetAcquisition({
      ...CREDIT,
      isRelatedParty: true,
      marketValue: D("60000000.00"),
      marketValueAssessor: "KJPP Contoh",
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    // Komersial tetap harga transaksi; selisih tampil, bukan jurnal kedua.
    expect(r.commercialBasis.toFixed(2)).toBe("50000000.00")
    expect(r.fiscalBasis.toFixed(2)).toBe("60000000.00")
  })

  it("E120-3: hibah terkecuali dasar = sisa buku fiskal pemberi + TIDAK dapat disusutkan", () => {
    const r = resolveAssetAcquisition({
      ...CASH,
      acquisitionType: "GRANT_DONATION",
      sourceDocumentRef: "AKTA-HIBAH-01",
      counterpartMapped: true,
      grantIsExempt: true,
      grantorFiscalBookValue: D("30000000.00"),
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.counterpartKind).toBe("grant-income")
    expect(r.fiscalBasis.toFixed(2)).toBe("30000000.00")
    expect(r.fiscalBasisSource).toBe("grantor-fiscal-book-value")
    expect(r.fiscalDepreciable).toBe(false)
  })

  it("hibah terkecuali tanpa sisa buku pemberi ditolak; tak terkecuali wajib pasar bernama", () => {
    expect(
      resolveAssetAcquisition({
        ...CASH,
        acquisitionType: "GRANT_DONATION",
        sourceDocumentRef: "AKTA-HIBAH-01",
        counterpartMapped: true,
        grantIsExempt: true,
      }),
    ).toEqual({ status: "reject", reason: "missing-grantor-fiscal-book-value" })
    expect(
      resolveAssetAcquisition({
        ...CASH,
        acquisitionType: "GRANT_DONATION",
        sourceDocumentRef: "AKTA-HIBAH-01",
        counterpartMapped: true,
        grantIsExempt: false,
      }),
    ).toEqual({ status: "reject", reason: "missing-market-value" })
  })

  it("E120-4: EXCHANGE tanpa penilaian pasar tidak mengubah dasar fiskal (ditolak)", () => {
    expect(
      resolveAssetAcquisition({
        ...CASH,
        acquisitionType: "EXCHANGE",
        sourceDocumentRef: "BA-TUKAR-01",
        counterpartMapped: true,
        surrenderedAssetCarryingAmount: D("40000000.00"),
      }),
    ).toEqual({ status: "reject", reason: "missing-market-value" })
  })

  it("EXCHANGE: fiskal harga pasar; komersial nilai tercatat diserahkan bila tercatat", () => {
    const r = resolveAssetAcquisition({
      ...CASH,
      acquisitionType: "EXCHANGE",
      sourceDocumentRef: "BA-TUKAR-01",
      counterpartMapped: true,
      marketValue: D("75000000.00"),
      marketValueAssessor: "KJPP Contoh",
      surrenderedAssetCarryingAmount: D("40000000.00"),
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.fiscalBasis.toFixed(2)).toBe("75000000.00")
    expect(r.commercialBasis.toFixed(2)).toBe("40000000.00")
  })
})

describe("PPN Masukan hanya faktur tertaut (E120-6)", () => {
  it("tanpa faktur tertaut PPN nol walau nominal PPN diberikan", () => {
    const r = resolveAssetAcquisition({
      ...CREDIT,
      hasLinkedTaxInvoice: false,
      linkedInputVatAmount: D("5500000.00"),
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.inputVatAmount.toFixed(2)).toBe("0.00")
    expect(r.vatEvidence).toBe("none")
  })

  it("faktur tertaut: PPN dari faktur itu sen persis, bukan cost x tarif", () => {
    const r = resolveAssetAcquisition({
      ...CREDIT,
      hasLinkedTaxInvoice: true,
      linkedInputVatAmount: D("5500000.00"),
    })
    expect(r.status).toBe("resolved")
    if (r.status !== "resolved") return
    expect(r.inputVatAmount.toFixed(2)).toBe("5500000.00")
    expect(r.vatEvidence).toBe("linked-invoice")
  })
})
