import { describe, it, expect, vi } from "vitest"
import {
  pickPriceListRow,
  pickPriceListPrice,
  derivePriceListExpiryStatus,
  pickExpiringPriceListRows,
  loadExpiringPriceListRows,
  type PriceListRow,
} from "@/lib/services/customer-price-list.service"
import { customerPriceListSchema } from "@/lib/validations/price-list.schemas"

// F-2026-10-25-001-S inti — AC-PX-B1..B6 (spec PR #747).
// Falsifikasi: balik batas inklusif / cabut syarat berakhir / bocor antrean = MERAH.

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const row = (over: Partial<PriceListRow>): PriceListRow => ({
  customerCategoryId: null,
  itemId: 1,
  price: 90000,
  effectiveDate: null,
  expiresAt: null,
  isActive: true,
  ...over,
})
const at = { itemId: 1, customerCategoryId: null }

describe("AC-PX-B1: batas berakhir INKLUSIF tanggal dokumen", () => {
  const rows = [row({ price: 80000, expiresAt: d("2026-10-31") })]
  it("dokumen tepat pada tanggalBerakhir memakai harga baris itu", () => {
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-31") })).toBe(80000)
  })
  it("dokumen +1 hari TIDAK memakainya", () => {
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-11-01") })).toBeNull()
  })
  it("dokumen bertime-of-day pada tanggal berakhir tetap berlaku (EC-5 date-only)", () => {
    expect(pickPriceListPrice(rows, { ...at, date: new Date("2026-10-31T15:30:00Z") })).toBe(80000)
  })
  it("dokumen backdate sebelum berakhir tetap memakai harga masa dokumennya", () => {
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-01") })).toBe(80000)
  })
})

describe("AC-PX-B2: tanpa tanggalBerakhir = perilaku lama", () => {
  it("baris expiresAt null menang di tanggal berapa pun", () => {
    const rows = [row({ price: 70000 })]
    expect(pickPriceListPrice(rows, { ...at, date: d("2030-01-01") })).toBe(70000)
  })
  it("baris tanpa field expiresAt (undefined) sama", () => {
    const legacy = row({ price: 70000 })
    delete legacy.expiresAt
    expect(pickPriceListPrice([legacy], { ...at, date: d("2030-01-01") })).toBe(70000)
  })
})

describe("AC-PX-B3: kandidat teratas berakhir -> kandidat berikutnya", () => {
  it("kategori spesifik berakhir, umum belum -> umum menang (EC-3)", () => {
    const rows = [
      row({ id: 1, customerCategoryId: 7, price: 80000, expiresAt: d("2026-10-20") }),
      row({ id: 2, price: 90000 }),
    ]
    expect(pickPriceListRow(rows, { itemId: 1, customerCategoryId: 7, date: d("2026-10-25") })?.price).toBe(90000)
  })
  it("tingkat minQty besar berakhir, tingkat kecil belum -> kecil menang (EC-4)", () => {
    const rows = [
      row({ id: 1, minQty: 10, price: 80000, expiresAt: d("2026-10-20") }),
      row({ id: 2, minQty: 1, price: 90000 }),
    ]
    expect(pickPriceListRow(rows, { ...at, date: d("2026-10-25"), qty: 20 })?.price).toBe(90000)
  })
  it("semua kandidat berakhir -> null (fallback Item.price)", () => {
    const rows = [row({ expiresAt: d("2026-10-20") })]
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-25") })).toBeNull()
  })
  it("EC-1: effectiveDate null + expiresAt terisi berlaku s.d. berakhir", () => {
    const rows = [row({ price: 80000, expiresAt: d("2026-10-31") })]
    expect(pickPriceListPrice(rows, { ...at, date: d("2020-01-01") })).toBe(80000)
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-11-01") })).toBeNull()
  })
  it("EC-2: expiresAt = effectiveDate berlaku satu hari", () => {
    const rows = [row({ price: 80000, effectiveDate: d("2026-10-15"), expiresAt: d("2026-10-15") })]
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-14") })).toBeNull()
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-15") })).toBe(80000)
    expect(pickPriceListPrice(rows, { ...at, date: d("2026-10-16") })).toBeNull()
  })
})

describe("AC-PX-B4: validasi simpan (skema)", () => {
  const base = { itemId: "1", price: "90000", minQty: "1" }
  it("expiresAt < effectiveDate ditolak, pesan menyebut kedua tanggal", () => {
    const r = customerPriceListSchema.safeParse({ ...base, effectiveDate: "2026-11-01", expiresAt: "2026-10-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toContain("2026-10-01")
  })
  it("expiresAt = effectiveDate diterima; kosong diterima", () => {
    expect(customerPriceListSchema.safeParse({ ...base, effectiveDate: "2026-10-15", expiresAt: "2026-10-15" }).success).toBe(true)
    expect(customerPriceListSchema.safeParse({ ...base }).success).toBe(true)
  })
})

describe("status masa turunan (BR-PX-05)", () => {
  const ref = { referenceDate: d("2026-10-25"), expiringWindowDays: 30 }
  it("nonaktif / sudah_berakhir / belum_berlaku / tanpa_batas / berlaku / segera_berakhir", () => {
    expect(derivePriceListExpiryStatus(row({ isActive: false }), ref)).toBe("nonaktif")
    expect(derivePriceListExpiryStatus(row({ expiresAt: d("2026-10-24") }), ref)).toBe("sudah_berakhir")
    expect(derivePriceListExpiryStatus(row({ effectiveDate: d("2026-11-01") }), ref)).toBe("belum_berlaku")
    expect(derivePriceListExpiryStatus(row({}), ref)).toBe("tanpa_batas")
    expect(derivePriceListExpiryStatus(row({ expiresAt: d("2026-12-31") }), ref)).toBe("berlaku")
    expect(derivePriceListExpiryStatus(row({ expiresAt: d("2026-11-10") }), ref)).toBe("segera_berakhir")
  })
  it("tepat pada tanggal berakhir = segera_berakhir, bukan sudah_berakhir", () => {
    expect(derivePriceListExpiryStatus(row({ expiresAt: d("2026-10-25") }), ref)).toBe("segera_berakhir")
  })
})

describe("AC-PX-B6: antrean segera berakhir (BR-PX-08)", () => {
  const ref = { referenceDate: d("2026-10-25"), windowDays: 30 }
  it("hanya aktif + bertanggal + dalam jendela; urutan expiresAt naik, seri id naik", () => {
    const rows = [
      row({ id: 5, expiresAt: d("2026-11-10") }),
      row({ id: 3, expiresAt: d("2026-11-10") }),
      row({ id: 1, expiresAt: d("2026-10-26") }),
      row({ id: 2 }), // tanpa batas -> bocor = MERAH
      row({ id: 4, isActive: false, expiresAt: d("2026-10-26") }), // nonaktif -> bocor = MERAH
      row({ id: 6, expiresAt: d("2026-10-24") }), // sudah berakhir -> bukan antrean
      row({ id: 7, expiresAt: d("2026-12-31") }), // di luar jendela
    ]
    expect(pickExpiringPriceListRows(rows, ref).map((r) => r.id)).toEqual([1, 3, 5])
  })
  it("batas jendela inklusif: berakhir tepat ref+windowDays masuk", () => {
    expect(pickExpiringPriceListRows([row({ id: 1, expiresAt: d("2026-11-24") })], ref).map((r) => r.id)).toEqual([1])
    expect(pickExpiringPriceListRows([row({ id: 1, expiresAt: d("2026-11-25") })], ref)).toEqual([])
  })
  it("loader: saring query aktif+bertanggal, normalisasi number, urutan antrean", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 2, customerCategoryId: null, itemId: 1, price: "90000", minQty: "1", effectiveDate: null, expiresAt: d("2026-11-01"), isActive: true },
      { id: 1, customerCategoryId: null, itemId: 1, price: "80000", minQty: "1", effectiveDate: null, expiresAt: d("2026-10-30"), isActive: true },
      { id: 3, customerCategoryId: null, itemId: 1, price: "70000", minQty: "1", effectiveDate: null, expiresAt: null, isActive: true },
    ])
    const out = await loadExpiringPriceListRows({ customerPriceList: { findMany } } as never, ref)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, expiresAt: { not: null } } }))
    expect(out.map((r) => r.id)).toEqual([1, 2])
    expect(out[0].price).toBe(80000)
  })
})
