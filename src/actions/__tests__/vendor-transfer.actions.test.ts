import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    vendorPayment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  }
  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    assertPeriodMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: (...a: any) => mocks.assertPeriodMock(...a) }))

import * as actions from "../vendor-transfer.actions"

function fd(payload: Record<string, string>, paymentIds: string[] = ["10"]): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  for (const id of paymentIds) f.append("paymentIds", id)
  return f
}

const base = { date: "2026-10-20", reference: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.assertPeriodMock.mockResolvedValue(undefined)
  mocks.prismaMock.vendorPayment.findMany.mockResolvedValue([
    { id: 10, documentNo: "VP-10" },
  ])
  mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 1 })
})

describe("markVendorPaymentsTransferred Zod validation", () => {
  it("menolak tanggal fiktif 2026-02-30, DB tidak disentuh", async () => {
    const res = await actions.markVendorPaymentsTransferred(fd({ ...base, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Validasi gagal")
    expect(mocks.prismaMock.vendorPayment.updateMany).not.toHaveBeenCalled()
  })

  it("menolak tanggal kosong", async () => {
    const res = await actions.markVendorPaymentsTransferred(fd({ ...base, date: "" }))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.vendorPayment.updateMany).not.toHaveBeenCalled()
  })

  it("menolak reference > 255 karakter", async () => {
    const res = await actions.markVendorPaymentsTransferred(fd({ ...base, reference: "x".repeat(256) }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Validasi gagal")
    expect(mocks.prismaMock.vendorPayment.updateMany).not.toHaveBeenCalled()
  })

  it("happy path: tanggal tersimpan tengah malam UTC", async () => {
    const res = await actions.markVendorPaymentsTransferred(fd(base))
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.vendorPayment.updateMany.mock.calls.at(-1)![0].data
    expect(data.transferredAt.toISOString()).toBe("2026-10-20T00:00:00.000Z")
    expect(data.transferReference).toBeNull()
  })

  it("happy path: reference disimpan apa adanya", async () => {
    const res = await actions.markVendorPaymentsTransferred(fd({ ...base, reference: "TRF-123" }))
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.vendorPayment.updateMany.mock.calls.at(-1)![0].data
    expect(data.transferReference).toBe("TRF-123")
  })
})
