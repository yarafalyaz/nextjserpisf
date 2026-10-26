import { describe, it, expect } from "vitest"
import {
  validateItemTaxDefaults,
  resolveItemTaxLineSnapshot,
  taxEffectiveOn,
  type ItemTaxDefaultInput,
  type TaxReferenceRow,
} from "../item-tax-default.service"

/**
 * F-2026-10-25-042-V (vonis Q-ITX-1): penjaga default pajak per Item +
 * resolver snapshot baris. AC-ITX-V1..V5 falsifikasi di sini.
 */

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day))

const item = (over: Partial<ItemTaxDefaultInput> = {}): ItemTaxDefaultInput => ({
  isScrapSaleItem: false,
  defaultSalesTaxId: null,
  defaultPurchaseTaxId: null,
  defaultDppPercent: null,
  ...over,
})

const tax = (over: Partial<TaxReferenceRow> = {}): TaxReferenceRow => ({
  id: 7,
  rate: 12,
  isActive: true,
  deletedAt: null,
  effectiveFrom: null,
  effectiveTo: null,
  ...over,
})

describe("validateItemTaxDefaults", () => {
  it("AC-ITX-V1: ketiga field null lolos (perilaku existing byte-sama)", () => {
    expect(() => validateItemTaxDefaults(item())).not.toThrow()
  })

  it("AC-ITX-V3: persen di luar 0-100 ditolak, bukan clamp", () => {
    expect(() => validateItemTaxDefaults(item({ defaultDppPercent: 100.01 }))).toThrow(/0,00 dan 100,00/)
    expect(() => validateItemTaxDefaults(item({ defaultDppPercent: -0.01 }))).toThrow(/0,00 dan 100,00/)
    expect(() => validateItemTaxDefaults(item({ defaultDppPercent: Number.NaN }))).toThrow(/0,00 dan 100,00/)
    expect(() => validateItemTaxDefaults(item({ defaultDppPercent: 0 }))).not.toThrow()
    expect(() => validateItemTaxDefaults(item({ defaultDppPercent: 100 }))).not.toThrow()
  })

  it("id rujukan bukan bilangan bulat positif ditolak", () => {
    expect(() => validateItemTaxDefaults(item({ defaultSalesTaxId: 0 }))).toThrow(/bilangan bulat positif/)
    expect(() => validateItemTaxDefaults(item({ defaultPurchaseTaxId: 1.5 }))).toThrow(/bilangan bulat positif/)
  })

  it("AC-ITX-V5: item scrap + default apa pun ditolak saat simpan", () => {
    expect(() => validateItemTaxDefaults(item({ isScrapSaleItem: true, defaultSalesTaxId: 7 }))).toThrow(/besi tua/)
    expect(() => validateItemTaxDefaults(item({ isScrapSaleItem: true, defaultPurchaseTaxId: 7 }))).toThrow(/besi tua/)
    expect(() => validateItemTaxDefaults(item({ isScrapSaleItem: true, defaultDppPercent: 50 }))).toThrow(/besi tua/)
    expect(() => validateItemTaxDefaults(item({ isScrapSaleItem: true }))).not.toThrow()
  })
})

describe("resolveItemTaxLineSnapshot", () => {
  const doc = d(2026, 10, 26)

  it("AC-ITX-V1: item tanpa default -> null persis (dokumen existing tidak berubah)", () => {
    expect(resolveItemTaxLineSnapshot({ item: item(), direction: "sales", tax: null, documentDate: doc })).toBeNull()
  })

  it("baris bebas (item null) -> null persis (BR-ITX-07)", () => {
    expect(resolveItemTaxLineSnapshot({ item: null, direction: "sales", tax: tax(), documentDate: doc })).toBeNull()
  })

  it("AC-ITX-V2: default tersalin beku (tax id + tarif saat salin + persen)", () => {
    const snap = resolveItemTaxLineSnapshot({
      item: item({ defaultSalesTaxId: 7, defaultDppPercent: 50 }),
      direction: "sales",
      tax: tax({ rate: 12 }),
      documentDate: doc,
    })
    expect(snap).toEqual({ taxId: 7, taxRate: 12, dppPercent: 50 })
    // master berubah sesudahnya tidak menulis ulang snapshot yang sudah lahir
    const snap2 = resolveItemTaxLineSnapshot({
      item: item({ defaultSalesTaxId: 7, defaultDppPercent: 50 }),
      direction: "sales",
      tax: tax({ rate: 11 }),
      documentDate: doc,
    })
    expect(snap).toEqual({ taxId: 7, taxRate: 12, dppPercent: 50 })
    expect(snap2?.taxRate).toBe(11)
  })

  it("arah pembelian memakai defaultPurchaseTaxId, bukan penjualan", () => {
    const snap = resolveItemTaxLineSnapshot({
      item: item({ defaultSalesTaxId: 7, defaultPurchaseTaxId: 9 }),
      direction: "purchase",
      tax: tax({ id: 9, rate: 11 }),
      documentDate: doc,
    })
    expect(snap).toEqual({ taxId: 9, taxRate: 11, dppPercent: null })
  })

  it("persen-only: snapshot persen tanpa tarif (taxId/taxRate null)", () => {
    expect(
      resolveItemTaxLineSnapshot({ item: item({ defaultDppPercent: 91.67 }), direction: "sales", tax: null, documentDate: doc }),
    ).toEqual({ taxId: null, taxRate: null, dppPercent: 91.67 })
  })

  it("AC-ITX-V4: rujukan rusak fail-closed tanpa fallback", () => {
    const withSales = item({ defaultSalesTaxId: 7 })
    expect(() => resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: null, documentDate: doc })).toThrow(/tidak ditemukan/)
    expect(() => resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: tax({ id: 8 }), documentDate: doc })).toThrow(/tidak ditemukan/)
    expect(() => resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: tax({ isActive: false }), documentDate: doc })).toThrow(/nonaktif atau terhapus/)
    expect(() => resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: tax({ deletedAt: doc }), documentDate: doc })).toThrow(/nonaktif atau terhapus/)
    expect(() =>
      resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: tax({ effectiveFrom: d(2026, 11, 1) }), documentDate: doc }),
    ).toThrow(/di luar masa efektif/)
    expect(() =>
      resolveItemTaxLineSnapshot({ item: withSales, direction: "sales", tax: tax({ effectiveTo: d(2026, 10, 25) }), documentDate: doc }),
    ).toThrow(/di luar masa efektif/)
  })

  it("batas masa efektif inklusif pada tanggal dokumen", () => {
    expect(taxEffectiveOn(tax({ effectiveFrom: doc, effectiveTo: doc }), doc)).toBe(true)
  })
})
