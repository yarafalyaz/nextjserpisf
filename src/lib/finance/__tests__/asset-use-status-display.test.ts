import { describe, expect, it } from "vitest"

import {
  assetUseStatusDisplay,
  CRON_SKIP_REASON_LABELS,
  HELD_FOR_SALE_FACT_LABELS,
} from "../asset-use-status-display"

/**
 * Falsifikasi konsumen F-2026-10-23-117-V (Putusan 1-4): status di luar
 * daftar terdaftar TIDAK boleh tampil sebagai label sah; alasan lewatan
 * cron wajib bernama; fakta held-for-sale bernama (a)-(e).
 */
describe("assetUseStatusDisplay — Putusan 1", () => {
  it("status terdaftar berlabel resmi", () => {
    expect(assetUseStatusDisplay("active").label).toBe("Aktif")
    expect(assetUseStatusDisplay("held_for_sale").label).toBe(
      "Dimiliki untuk Dijual",
    )
    expect(assetUseStatusDisplay("disposed").label).toBe("Dilepas")
    expect(assetUseStatusDisplay("disposed").rawStatus).toBeNull()
  })

  it("null tampil sebagai Aktif (default kolom), bukan temuan", () => {
    expect(assetUseStatusDisplay(null).label).toBe("Aktif")
    expect(assetUseStatusDisplay(undefined).rawStatus).toBeNull()
  })

  it("status karangan = temuan bernama + nilai mentah, bukan label sah", () => {
    for (const raw of ["inactive", "maintenance", "idle", "rusak"]) {
      const display = assetUseStatusDisplay(raw)
      expect(display.label).toBe("Status tidak terdaftar")
      expect(display.rawStatus).toBe(raw)
    }
  })
})

describe("label alasan lewatan cron — Putusan 2/3/4", () => {
  it("semua alasan terdaftar bernama, held-for-sale sebut fiskal tetap jalan", () => {
    expect(CRON_SKIP_REASON_LABELS.disposed).toBe("Sudah dilepas")
    expect(CRON_SKIP_REASON_LABELS["held-for-sale"]).toContain("fiskal tetap berjalan")
    expect(CRON_SKIP_REASON_LABELS["at-residual"]).toContain("tersusutkan penuh")
    expect(CRON_SKIP_REASON_LABELS["unregistered-status"]).toContain(
      "tidak terdaftar",
    )
  })
})

describe("label fakta held-for-sale — Putusan 3", () => {
  it("lima fakta (a)-(e) bernama", () => {
    expect(Object.keys(HELD_FOR_SALE_FACT_LABELS)).toEqual(["a", "b", "c", "d", "e"])
    expect(HELD_FOR_SALE_FACT_LABELS.d).toContain("12 bulan")
  })
})
