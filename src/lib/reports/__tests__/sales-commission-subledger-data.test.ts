import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader rekap subledger komisi per penerima (F-2026-10-25-049-S).
 * Yang dijaga: view_reports fail-closed sebelum muat; selama inti tahap 3
 * (G1) belum live, ledgerAvailable:false jujur — saldo 0 berlabel
 * belum-tersedia, BUKAN dibangun dari rekap (BR-KOM37-12, QA-KOM49-7:
 * baca tidak menulis, nol baris lahir dari baca).
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

import { getSalesCommissionSubledgerRecap } from "../sales-commission-subledger-data"
import { SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE } from "../sales-commission-payable"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({
    id: "5",
    roles: ["admin"],
    permissions: ["view_reports"],
  })
})

describe("getSalesCommissionSubledgerRecap — gerbang + label jujur", () => {
  it("menegakkan view_reports sebelum memuat", async () => {
    await getSalesCommissionSubledgerRecap()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
  })

  it("tanpa izin: loader menolak, nol muatan bocor", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesCommissionSubledgerRecap()).rejects.toThrow("Tidak memiliki izin")
  })

  it("inti belum live: ledgerAvailable false, saldo 0, label belum-tersedia verbatim", async () => {
    const r = await getSalesCommissionSubledgerRecap()
    expect(r.payable.ledgerAvailable).toBe(false)
    expect(r.payable.rows).toEqual([])
    expect(r.payable.totalBalance).toBe(0)
    expect(r.payable.notice).toBe(SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE)
    expect(r.rows).toEqual([])
    expect(r.reconciliations).toEqual([])
  })
})
