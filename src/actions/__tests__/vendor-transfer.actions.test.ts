import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    vendorPayment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
    $executeRaw: vi.fn().mockResolvedValue(1),
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
  mocks.prismaMock.vendorPayment.count.mockReset().mockResolvedValue(1)
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

describe("klaim kondisional mark/unmark (regresi saling timpa)", () => {
  it("mark hanya mengklaim baris transferredAt null; updated dari count klaim", async () => {
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.markVendorPaymentsTransferred(fd(base, ["10", "11"]))

    expect(res).toEqual({ success: true, updated: 1 })
    const where = mocks.prismaMock.vendorPayment.updateMany.mock.calls.at(-1)![0].where
    expect(where.transferredAt).toBeNull()
    expect(where.deletedAt).toBeNull()
  })

  it("regresi putaran 43: mark mengecualikan pembayaran reversed dari klaim", async () => {
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.markVendorPaymentsTransferred(fd(base, ["10"]))

    expect(res).toEqual({ success: true, updated: 1 })
    const where = mocks.prismaMock.vendorPayment.updateMany.mock.calls.at(-1)![0].where
    expect(where.status).toEqual({ not: "reversed" })
  })

  it("mark saat semua sudah ditransfer -> error jujur, bukan sukses semu", async () => {
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 0 })

    const res = await actions.markVendorPaymentsTransferred(fd(base))

    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah ditandai")
  })

  it("mark saat baris tidak ada -> tidak ditemukan", async () => {
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.vendorPayment.count.mockResolvedValue(0)

    const res = await actions.markVendorPaymentsTransferred(fd(base))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })

  it("unmark hanya mengklaim baris yang sedang ditandai", async () => {
    mocks.prismaMock.vendorPayment.findMany.mockResolvedValue([{ transferredAt: new Date("2026-10-20T00:00:00Z") }])
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.unmarkVendorPaymentsTransferred(fd({}, ["10"]))

    expect(res).toEqual({ success: true, updated: 1 })
    const arg = mocks.prismaMock.vendorPayment.updateMany.mock.calls.at(-1)![0]
    expect(arg.where.transferredAt).toEqual({ not: null })
    expect(arg.data).toEqual({ transferredAt: null, transferReference: null })
  })

  it("regression round 17: mark menilai ulang periode di dalam tx berkunci", async () => {
    mocks.assertPeriodMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"))
    const res = await actions.markVendorPaymentsTransferred(fd(base))
    expect(res.success).toBe(false)
    expect(mocks.assertPeriodMock.mock.calls.some((c: unknown[]) => c[1] === mocks.prismaMock)).toBe(true)
    expect(mocks.prismaMock.vendorPayment.updateMany).not.toHaveBeenCalled()
  })

  it("regression round 17: unmark menilai periode dari baris terkunci di dalam tx", async () => {
    mocks.prismaMock.vendorPayment.findMany.mockResolvedValue([{ transferredAt: new Date("2026-10-20T00:00:00Z") }])
    mocks.assertPeriodMock.mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"))
    const res = await actions.unmarkVendorPaymentsTransferred(fd({}, ["10"]))
    expect(res.success).toBe(false)
    expect(mocks.assertPeriodMock.mock.calls.some((c: unknown[]) => c[1] === mocks.prismaMock)).toBe(true)
    expect(mocks.prismaMock.vendorPayment.updateMany).not.toHaveBeenCalled()
  })

  it("unmark saat belum ada yang ditandai -> error jujur", async () => {
    mocks.prismaMock.vendorPayment.findMany.mockResolvedValue([{ transferredAt: null }])
    mocks.prismaMock.vendorPayment.updateMany.mockResolvedValue({ count: 0 })

    const res = await actions.unmarkVendorPaymentsTransferred(fd({}, ["10"]))

    expect(res.success).toBe(false)
    expect(res.error).toContain("belum ditandai")
  })
})
