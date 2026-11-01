import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-035-B: aksi approve/reject/list override gerbang kredit.
 * AC-CL2-B5: SoD mutlak, key wajib, alasan tolak wajib.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireAnyPermission: vi.fn(),
  rows: [] as Record<string, unknown>[],
  customerDeletedAt: null as Date | null,
  updates: [] as Record<string, unknown>[],
  claimCount: 1,
  lockCalls: [] as unknown[][],
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mocks.requireAnyPermission(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    creditOverride: {
      findMany: vi.fn(async () => mocks.rows),
      findUnique: vi.fn(
        async ({ where }: { where: { id: number } }) =>
          mocks.rows.find((r) => r.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.updates.push(data)
        return { id: 44, ...data }
      }),
    },
    customer: {
      findUnique: vi.fn(async () => ({ deletedAt: mocks.customerDeletedAt })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn(async (...a: unknown[]) => {
          mocks.lockCalls.push(a)
          return 1
        }),
        creditOverride: {
          findUnique: vi.fn(
            async ({ where }: { where: { id: number } }) =>
              mocks.rows.find((r) => r.id === where.id) ?? null,
          ),
          findUniqueOrThrow: vi.fn(
            async ({ where }: { where: { id: number } }) =>
              mocks.rows.find((r) => r.id === where.id) ?? { id: where.id },
          ),
          update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            mocks.updates.push(data)
            return { id: 44, ...data }
          }),
          updateMany: vi.fn(async ({ where, data }: { where: { id: number; status: string }; data: Record<string, unknown> }) => {
            const row = mocks.rows.find((r) => r.id === where.id)
            if (!row || row.status !== where.status || mocks.claimCount === 0) {
              return { count: 0 }
            }
            mocks.updates.push(data)
            Object.assign(row, data)
            return { count: 1 }
          }),
        },
        customer: {
          findUnique: vi.fn(async () => ({ deletedAt: mocks.customerDeletedAt })),
        },
      }),
    ),
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn(async () => undefined),
}))

import {
  approveCreditOverride,
  listCreditOverrides,
  rejectCreditOverride,
} from "../credit-override.actions"

const pendingRow = {
  id: 44,
  customerId: 3,
  documentType: "sales_order",
  attemptedAmount: 600000,
  creditLimit: 500000,
  exposure: 600000,
  exposureStatus: "over",
  utilization: 120,
  quotationId: null,
  salesOrderId: null,
  requestedBy: 7,
  requestReason: "Proyek mendesak",
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  usedDocumentId: null,
  usedDocumentNo: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  customer: { name: "PT Uji" },
}

describe("credit-override.actions (F-2026-10-25-035-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows = [{ ...pendingRow }]
    mocks.updates = []
    mocks.claimCount = 1
    mocks.lockCalls = []
    mocks.customerDeletedAt = null
    mocks.requirePermission.mockResolvedValue({
      id: "9",
      roles: ["admin"],
      permissions: ["approve_credit_overrides"],
    })
    mocks.requireAnyPermission.mockResolvedValue({
      id: "9",
      roles: ["admin"],
      permissions: ["approve_credit_overrides"],
    })
  })

  it("approve oleh bukan peminta -> approved + expiresAt terisi", async () => {
    const res = await approveCreditOverride(44)
    expect(res.success).toBe(true)
    expect(mocks.requirePermission).toHaveBeenCalledWith("approve_credit_overrides")
    expect(mocks.updates[0].status).toBe("approved")
    expect(mocks.updates[0].decidedBy).toBe(9)
    expect(mocks.updates[0].expiresAt).toBeInstanceOf(Date)
  })

  it("AC-CL2-B5: approve oleh peminta sendiri -> tertolak (SoD)", async () => {
    mocks.requirePermission.mockResolvedValue({
      id: "7",
      roles: ["admin"],
      permissions: ["approve_credit_overrides"],
    })
    const res = await approveCreditOverride(44)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("pemisahan tugas")
    expect(mocks.updates).toHaveLength(0)
  })

  it("reject tanpa alasan -> tertolak, nol update", async () => {
    const res = await rejectCreditOverride(44, "   ")
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("wajib diisi")
    expect(mocks.updates).toHaveLength(0)
  })

  it("reject dengan alasan oleh bukan peminta -> rejected + alasan tersimpan", async () => {
    const res = await rejectCreditOverride(44, "Limit belum layak naik")
    expect(res.success).toBe(true)
    expect(mocks.updates[0].status).toBe("rejected")
    expect(mocks.updates[0].decisionReason).toBe("Limit belum layak naik")
  })

  it("regression round 19: klaim kondisional kalah (approve vs reject konkuren) -> tertolak jujur", async () => {
    mocks.claimCount = 0
    const res = await approveCreditOverride(44)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("sudah tidak pending")
    expect(mocks.updates).toHaveLength(0)
    expect(mocks.lockCalls.length).toBeGreaterThan(0)

    mocks.rows = [{ ...pendingRow }]
    const resReject = await rejectCreditOverride(44, "Tidak layak")
    expect(resReject.success).toBe(false)
    expect(mocks.updates).toHaveLength(0)
  })

  it("approve rekod bukan pending -> tertolak", async () => {
    mocks.rows = [{ ...pendingRow, status: "used" }]
    const res = await approveCreditOverride(44)
    expect(res.success).toBe(false)
    expect(mocks.updates).toHaveLength(0)
  })

  it("approve saat pelanggan terarsip -> override gugur, tertolak", async () => {
    mocks.customerDeletedAt = new Date()
    const res = await approveCreditOverride(44)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("diarsipkan")
  })

  it("list: gerbang baca approve_credit_overrides ATAU view_reports", async () => {
    const res = await listCreditOverrides()
    expect(res.success).toBe(true)
    expect(mocks.requireAnyPermission).toHaveBeenCalledWith([
      "approve_credit_overrides",
      "view_reports",
    ])
    if (res.success) expect(res.data[0].status).toBe("pending")
  })
})
