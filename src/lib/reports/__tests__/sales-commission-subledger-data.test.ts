import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader subledger komisi (F-2026-10-25-049-S): view_reports fail-closed;
 * inti G1 belum live → ledgerAvailable:false jujur (BR-KOM37-12,
 * QA-KOM49-7 baca tidak menulis).
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))

import { getSalesCommissionSubledgerRecap } from "../sales-commission-subledger-data"
import { SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE } from "../sales-commission-payable"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "5", roles: ["admin"], permissions: ["view_reports"] })
})

describe("getSalesCommissionSubledgerRecap", () => {
  it("menegakkan view_reports; tanpa izin menolak tanpa muatan", async () => {
    await getSalesCommissionSubledgerRecap()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesCommissionSubledgerRecap()).rejects.toThrow("Tidak memiliki izin")
  })

  it("label belum-tersedia verbatim, saldo 0, status kosong", async () => {
    const r = await getSalesCommissionSubledgerRecap()
    expect(r.payable).toMatchObject({ ledgerAvailable: false, totalBalance: 0, rows: [] })
    expect(r.payable.notice).toBe(SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE)
    expect(r.lineStatuses).toEqual([])
  })
})
