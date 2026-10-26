import { describe, it, expect } from "vitest"
import {
  resolveCommissionRate,
  validateCommissionRateWrite,
  type CommissionRateRow,
} from "../customer-commission-rate.service"

/**
 * F-2026-10-25-036-S: resolusi tarif per tanggal faktur (semi-terbuka) +
 * penjaga histori. AC-KT-2/3/4/5 falsifikasi di sini.
 */

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day))
const row = (id: number, percent: number, from: Date, to: Date | null, cat = 1): CommissionRateRow => ({
  id,
  customerCategoryId: cat,
  commissionPercent: percent,
  effectiveFrom: from,
  effectiveTo: to,
})

describe("resolveCommissionRate", () => {
  const rows = [row(1, 2, d(2026, 1, 1), d(2026, 7, 1)), row(2, 3, d(2026, 7, 1), null)]

  it("AC-KT-2: tarif per tanggal faktur, bukan hari lunas (ganti di tengah)", () => {
    expect(resolveCommissionRate(rows, 1, d(2026, 6, 30))).toEqual({ commissionPercent: 2, customerCategoryId: 1, rateId: 1 })
    expect(resolveCommissionRate(rows, 1, d(2026, 7, 1))).toEqual({ commissionPercent: 3, customerCategoryId: 1, rateId: 2 })
    // batas semi-terbuka: tanggal = effectiveTo baris lama sudah masuk baris baru
    expect(resolveCommissionRate(rows, 1, d(2026, 1, 1)).commissionPercent).toBe(2)
  })

  it("AC-KT-5: tanpa kategori / belum berlaku = 0 jujur, rateId null", () => {
    expect(resolveCommissionRate(rows, null, d(2026, 3, 1))).toEqual({ commissionPercent: 0, customerCategoryId: null, rateId: null })
    expect(resolveCommissionRate(rows, 1, d(2025, 12, 31))).toEqual({ commissionPercent: 0, customerCategoryId: 1, rateId: null })
    expect(resolveCommissionRate(rows, 99, d(2026, 3, 1)).rateId).toBeNull()
  })
})

describe("validateCommissionRateWrite", () => {
  const existing = [row(1, 2, d(2026, 1, 1), null)]

  it("AC-KT-3: rentang tumpang tindih kategori sama ditolak berisik", () => {
    const err = validateCommissionRateWrite({
      existing, targetId: null, customerCategoryId: 1, commissionPercent: 5,
      effectiveFrom: d(2026, 6, 1), effectiveTo: null, targetIsSnapshotSource: false,
    })
    expect(err).toMatch(/bertumpang tindih/)
    // kategori lain tidak kena
    expect(validateCommissionRateWrite({
      existing, targetId: null, customerCategoryId: 2, commissionPercent: 5,
      effectiveFrom: d(2026, 6, 1), effectiveTo: null, targetIsSnapshotSource: false,
    })).toBeNull()
    // sesudah masa ditutup, baris sambungan lolos (semi-terbuka, tanpa celah)
    const closed = [row(1, 2, d(2026, 1, 1), d(2026, 7, 1))]
    expect(validateCommissionRateWrite({
      existing: closed, targetId: null, customerCategoryId: 1, commissionPercent: 5,
      effectiveFrom: d(2026, 7, 1), effectiveTo: null, targetIsSnapshotSource: false,
    })).toBeNull()
  })

  it("AC-KT-4: baris sumber snapshot — persen/effectiveFrom beku, hapus ditolak, tutup masa boleh", () => {
    const base = {
      existing, targetId: 1, customerCategoryId: 1, targetIsSnapshotSource: true,
    }
    expect(validateCommissionRateWrite({ ...base, commissionPercent: 9, effectiveFrom: d(2026, 1, 1), effectiveTo: null })).toMatch(/sudah menjadi sumber snapshot/)
    expect(validateCommissionRateWrite({ ...base, commissionPercent: 2, effectiveFrom: d(2026, 2, 1), effectiveTo: null })).toMatch(/sudah menjadi sumber snapshot/)
    expect(validateCommissionRateWrite({ ...base, commissionPercent: 2, effectiveFrom: d(2026, 1, 1), effectiveTo: null, isDelete: true })).toMatch(/tidak dapat dihapus/)
    // koreksi sah: tutup masa saja
    expect(validateCommissionRateWrite({ ...base, commissionPercent: 2, effectiveFrom: d(2026, 1, 1), effectiveTo: d(2026, 12, 31) })).toBeNull()
    // baris belum terpakai bebas diedit
    expect(validateCommissionRateWrite({ ...base, targetIsSnapshotSource: false, commissionPercent: 9, effectiveFrom: d(2026, 1, 1), effectiveTo: null })).toBeNull()
  })

  it("masa tidak valid + persen di luar 0..100 ditolak", () => {
    expect(validateCommissionRateWrite({
      existing: [], targetId: null, customerCategoryId: 1, commissionPercent: 2,
      effectiveFrom: d(2026, 7, 1), effectiveTo: d(2026, 7, 1), targetIsSnapshotSource: false,
    })).toMatch(/sesudah tanggal mulai/)
    expect(validateCommissionRateWrite({
      existing: [], targetId: null, customerCategoryId: 1, commissionPercent: 101,
      effectiveFrom: d(2026, 1, 1), effectiveTo: null, targetIsSnapshotSource: false,
    })).toMatch(/antara 0 dan 100/)
  })
})
