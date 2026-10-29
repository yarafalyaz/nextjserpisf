import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader subledger komisi (F-2026-10-25-049-S): view_reports fail-closed;
 * tahap 3 live → ledgerAvailable:true dari baris fisik (QA-KOM49-7 baca
 * tidak menulis).
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { commissionPayable: { findMany: vi.fn().mockResolvedValue([]) } },
}))

import { getSalesCommissionSubledgerRecap } from "../sales-commission-subledger-data"

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

  it("tahap 3 live: ledgerAvailable true, saldo 0 tercatat, status kosong", async () => {
    const r = await getSalesCommissionSubledgerRecap()
    expect(r.payable).toMatchObject({ ledgerAvailable: true, totalBalance: 0, rows: [] })
    expect(r.lineStatuses).toEqual([])
  })
})
