// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

import { statusLabel, STATUS_LABELS } from "@/lib/utils/status-labels"

/**
 * 113-B: status ketetapan + upaya + hasil putusan wajib berlabel Indonesia
 * satu sumber (STATUS_LABELS), dirender via StatusChip + statusLabel —
 * tanpa map ad-hoc per halaman.
 */
describe("tax-dispute status labels (113-B)", () => {
  it("semua status domain berlabel Indonesia", () => {
    expect(statusLabel("TERDAFTAR")).toBe("Terdaftar")
    expect(statusLabel("DIPROSES")).toBe("Diproses")
    expect(statusLabel("DIPUTUS_SEBAGIAN")).toBe("Diputus Sebagian")
    expect(statusLabel("DIPUTUS")).toBe("Diputus")
    expect(statusLabel("DIAJUKAN")).toBe("Diajukan")
    expect(statusLabel("DALAM_PROSES")).toBe("Dalam Proses")
    expect(statusLabel("DICABUT")).toBe("Dicabut")
    expect(statusLabel("BATAL")).toBe("Batal")
    expect(statusLabel("SELESAI")).toBe("Selesai")
    expect(statusLabel("DIKABULKAN")).toBe("Dikabulkan")
    expect(statusLabel("DIKABULKAN_SEBAGIAN")).toBe("Dikabulkan Sebagian")
    expect(statusLabel("DITOLAK")).toBe("Ditolak")
    expect(statusLabel("TIDAK_DAPAT_DITERIMA")).toBe("Tidak Dapat Diterima")
  })

  it("kunci 113-B hadir di STATUS_LABELS", () => {
    for (const key of [
      "TERDAFTAR",
      "DIPROSES",
      "DIPUTUS_SEBAGIAN",
      "DIPUTUS",
      "DIAJUKAN",
      "DALAM_PROSES",
      "DICABUT",
      "BATAL",
      "SELESAI",
      "DIKABULKAN",
      "DIKABULKAN_SEBAGIAN",
      "DITOLAK",
      "TIDAK_DAPAT_DITERIMA",
    ]) {
      expect(STATUS_LABELS[key], key).toBeTruthy()
    }
  })
})
