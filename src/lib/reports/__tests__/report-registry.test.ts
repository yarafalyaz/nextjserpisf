import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(async () => false),
}))

import { REPORTS, isReportPdfKey } from "../report-registry"

describe("isReportPdfKey", () => {
  it("menerima kunci laporan yang memang terdaftar", () => {
    const keys = Object.keys(REPORTS)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(isReportPdfKey(key), key).toBe(true)
    }
  })

  // Regresi: sebelumnya validasinya `value in REPORTS`, yang ikut menerima
  // properti warisan prototipe. Akibatnya GET /api/pdf?laporan=constructor
  // lolos whitelist lalu meledak saat definition.load dipanggil → 500, padahal
  // seharusnya 400 "Laporan tidak didukung".
  it("menolak kunci warisan prototipe", () => {
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(isReportPdfKey(key), key).toBe(false)
    }
  })

  it("menolak kunci yang tidak dikenal", () => {
    expect(isReportPdfKey("laporan-yang-tidak-ada")).toBe(false)
    expect(isReportPdfKey("")).toBe(false)
  })
})
