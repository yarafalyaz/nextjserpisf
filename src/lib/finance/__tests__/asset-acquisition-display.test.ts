import { describe, expect, it } from "vitest"

import {
  ACQUISITION_COUNTERPART_LABELS,
  ACQUISITION_FISCAL_BASIS_SOURCE_LABELS,
  ACQUISITION_REJECT_LABELS,
  ACQUISITION_VAT_EVIDENCE_LABELS,
  assetAcquisitionTypeDisplay,
} from "../asset-acquisition-display"
import { ASSET_ACQUISITION_TYPES } from "../asset-acquisition"

/**
 * Falsifikasi konsumen F-2026-10-23-120-V: jenis di luar daftar terdaftar
 * TIDAK boleh tampil sebagai label sah; lawan/dasar fiskal/alasan tolak
 * wajib bernama persis kontrak builder.
 */
describe("assetAcquisitionTypeDisplay", () => {
  it("lima jenis terdaftar berlabel resmi, tanpa nilai mentah", () => {
    expect(ASSET_ACQUISITION_TYPES).toHaveLength(5)
    expect(assetAcquisitionTypeDisplay("CASH_PURCHASE").label).toBe(
      "Pembelian Tunai",
    )
    expect(assetAcquisitionTypeDisplay("CREDIT_PURCHASE").label).toBe(
      "Pembelian Kredit (Utang Usaha)",
    )
    expect(assetAcquisitionTypeDisplay("GRANT_DONATION").label).toBe(
      "Hibah / Sumbangan",
    )
    expect(assetAcquisitionTypeDisplay("CAPITAL_CONTRIBUTION").label).toBe(
      "Setoran Modal Non-Tunai",
    )
    expect(assetAcquisitionTypeDisplay("EXCHANGE").label).toBe(
      "Tukar-Menukar / Tukar Tambah",
    )
    for (const t of ASSET_ACQUISITION_TYPES) {
      expect(assetAcquisitionTypeDisplay(t).rawType).toBeNull()
    }
  })

  it("jenis karangan/kosong = temuan bernama + nilai mentah", () => {
    for (const raw of ["tunai", "hibah", "lainnya", ""]) {
      const display = assetAcquisitionTypeDisplay(raw)
      expect(display.label).toBe("Jenis perolehan tidak terdaftar")
      expect(display.rawType).toBe(raw)
    }
    expect(assetAcquisitionTypeDisplay(null).label).toBe(
      "Jenis perolehan tidak terdaftar",
    )
    expect(assetAcquisitionTypeDisplay(null).rawType).toBeNull()
    expect(assetAcquisitionTypeDisplay(undefined).rawType).toBeNull()
  })
})

describe("label lawan/dasar/bukti — kontrak builder apa adanya", () => {
  it("lima kelas lawan bernama", () => {
    expect(ACQUISITION_COUNTERPART_LABELS["cash-bank"]).toBe("Kas / Bank")
    expect(ACQUISITION_COUNTERPART_LABELS["accounts-payable"]).toBe(
      "Utang Usaha",
    )
    expect(ACQUISITION_COUNTERPART_LABELS["grant-income"]).toBe(
      "Pendapatan Hibah",
    )
    expect(ACQUISITION_COUNTERPART_LABELS.equity).toBe("Ekuitas (Modal)")
    expect(ACQUISITION_COUNTERPART_LABELS["exchange-settlement"]).toBe(
      "Penyelesaian Tukar-Menukar",
    )
  })

  it("tiga sumber dasar fiskal bernama", () => {
    expect(ACQUISITION_FISCAL_BASIS_SOURCE_LABELS["actual-price"]).toBe(
      "Harga Sesungguhnya",
    )
    expect(ACQUISITION_FISCAL_BASIS_SOURCE_LABELS["market-value"]).toContain(
      "Harga Pasar",
    )
    expect(
      ACQUISITION_FISCAL_BASIS_SOURCE_LABELS["grantor-fiscal-book-value"],
    ).toBe("Nilai Sisa Buku Fiskal Pemberi")
  })

  it("tujuh alasan tolak bernama; bukti PPN dua keadaan", () => {
    expect(Object.keys(ACQUISITION_REJECT_LABELS)).toHaveLength(7)
    expect(ACQUISITION_REJECT_LABELS["unregistered-acquisition-type"]).toBe(
      "Jenis perolehan tidak terdaftar",
    )
    expect(ACQUISITION_REJECT_LABELS["missing-source-document"]).toContain(
      "Dokumen sumber",
    )
    expect(ACQUISITION_REJECT_LABELS["missing-market-value"]).toContain(
      "Harga pasar",
    )
    expect(ACQUISITION_VAT_EVIDENCE_LABELS["linked-invoice"]).toBe(
      "Faktur pajak masukan tertaut",
    )
    expect(ACQUISITION_VAT_EVIDENCE_LABELS.none).toBe(
      "Belum ada faktur pajak tertaut",
    )
  })
})
