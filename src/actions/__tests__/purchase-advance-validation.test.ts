import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * createPurchaseAdvance hand-parsed formData tanpa Zod: description tanpa
 * max-length (5MB lolos ke DB), tanggal via `new Date(...)` yang bergantung
 * zona waktu proses, id/akun via parseId manual.
 *
 * Setelah refactor: via parseFormData(purchaseAdvanceSchema), tanggal
 * YYYY-MM-DD tervalidasi kalender + dikonversi via wibDateToUtcMidnight,
 * description dibatasi 2000 char, akun sama ditolak di level schema.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const assertPeriodOpen = vi.fn()
  const vendorFindFirst = vi.fn()
  const accountFindMany = vi.fn()
  const advanceCreate = vi.fn()
  const advanceUpdate = vi.fn()
  const journalCreate = vi.fn()
  const checkIdempotency = vi.fn()

  const tx: Record<string, unknown> = {
    purchaseAdvance: { create: advanceCreate, update: advanceUpdate },
    journal: { create: journalCreate },
    vendor: { findFirst: vendorFindFirst },
    account: { findMany: accountFindMany },
    $executeRaw: vi.fn(async () => 0),
  }

  const prismaMock: Record<string, unknown> = {
    vendor: { findFirst: vendorFindFirst },
    account: { findMany: accountFindMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    vendorFindFirst,
    accountFindMany,
    advanceCreate,
    journalCreate,
    checkIdempotency,
    prismaMock,
    tx,
  }
})

vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/prisma")>()
  return { ...actual, prisma: mocks.prismaMock }
})
import { formFormData as form } from "./validation-mock-helpers"
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/services/document-sequence.service", async () => (await import("./validation-mock-helpers")).docSequenceFactory())
vi.mock("@/lib/services/period-lock.service", async () => (await import("./validation-mock-helpers")).periodLockFactory(mocks))
vi.mock("@/lib/utils/slug-db", async () => (await import("./validation-mock-helpers")).slugFixedFactory())
vi.mock("@/lib/utils/idempotency", () => ({ checkIdempotency: mocks.checkIdempotency }))

import { createPurchaseAdvance } from "../purchase-advance.actions"

const base = {
  date: "2026-09-15",
  vendorId: "11",
  amount: "500000",
  paymentAccountId: "101",
  advanceAccountId: "102",
  description: "ok",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.generateDocumentNumber.mockResolvedValue("DP-0001")
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.vendorFindFirst.mockResolvedValue({ id: 11, name: "Vendor A", isActive: true, deletedAt: null })
  mocks.accountFindMany.mockResolvedValue([
    { id: 101, type: "ASSET", reportGroup: "BANK", isActive: true, deletedAt: null },
    { id: 102, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
  ])
  mocks.checkIdempotency.mockResolvedValue(undefined)
  mocks.advanceCreate.mockResolvedValue({ id: 1, slug: "dp-1" })
  mocks.journalCreate.mockResolvedValue({ id: 9 })
})

describe("createPurchaseAdvance zod validation", () => {
  it("menolak description > 2000 char tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, description: "D".repeat(2001) }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Validasi gagal")
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak tanggal kalender fiktif (2026-02-30) tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak amount 0 tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, amount: "0" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak vendorId negatif tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(form({ ...base, vendorId: "-3" }))
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak akun kas == akun uang muka tanpa menyentuh DB", async () => {
    const res = await createPurchaseAdvance(
      form({ ...base, paymentAccountId: "101", advanceAccountId: "101" }),
    )
    expect(res.success).toBe(false)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("happy path: tanggal tersimpan sebagai tengah malam UTC", async () => {
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(true)
    const data = mocks.advanceCreate.mock.calls[0][0].data
    expect(data.date).toEqual(new Date(Date.UTC(2026, 8, 15)))
  })

  it("periode menutup sesudah cek luar -> cek dalam tx (dengan tx) menolak sebelum jurnal", async () => {
    mocks.assertPeriodOpen
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Periode sudah ditutup"))
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Periode sudah ditutup")
    expect(mocks.assertPeriodOpen).toHaveBeenCalledTimes(2)
    expect(mocks.assertPeriodOpen.mock.calls[1][1]).toBe(mocks.tx)
    expect(mocks.assertPeriodOpen.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.journalCreate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("R8-KEU-03: idempotency key diteruskan dalam tx dan duplikat menggagalkan tanpa create", async () => {
    await createPurchaseAdvance(form({ ...base, idempotencyKey: "key-advance-1" }))
    expect(mocks.checkIdempotency).toHaveBeenCalledWith("key-advance-1", mocks.tx, 7)
    expect(mocks.checkIdempotency.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.journalCreate.mock.invocationCallOrder[0],
    )

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 7 })
    mocks.generateDocumentNumber.mockResolvedValue("DP-0001")
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.vendorFindFirst.mockResolvedValue({ id: 11, name: "Vendor A", isActive: true, deletedAt: null })
    mocks.accountFindMany.mockResolvedValue([
      { id: 101, type: "ASSET", reportGroup: "BANK", isActive: true, deletedAt: null },
      { id: 102, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
    ])
    mocks.checkIdempotency.mockRejectedValue(new Error("Permintaan duplikat terdeteksi."))
    const res = await createPurchaseAdvance(form({ ...base, idempotencyKey: "key-advance-1" }))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("Permintaan duplikat")
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("R8-KEU-03: akun nonaktif ditolak sebelum tx", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { id: 101, type: "ASSET", reportGroup: "BANK", isActive: false, deletedAt: null },
      { id: 102, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
    ])
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("nonaktif atau sudah dihapus")
    expect(mocks.checkIdempotency).not.toHaveBeenCalled()
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("menolak vendor nonaktif (panggilan langsung / dinonaktifkan sesudah form dimuat)", async () => {
    mocks.vendorFindFirst.mockReset().mockResolvedValue({ id: 11, name: "Vendor A", isActive: false, deletedAt: null })
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/tidak aktif/)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("menolak bila vendor dinonaktifkan di antara cek luar dan tx (penilaian ulang berkunci)", async () => {
    mocks.vendorFindFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 11, name: "Vendor A", isActive: true, deletedAt: null })
      .mockResolvedValue({ id: 11, name: "Vendor A", isActive: false, deletedAt: null })
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/tidak aktif/)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("menolak bila akun pembayaran dinonaktifkan di antara cek luar dan tx", async () => {
    mocks.accountFindMany
      .mockReset()
      .mockResolvedValueOnce([
        { id: 101, type: "ASSET", reportGroup: "BANK", isActive: true, deletedAt: null },
        { id: 102, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
      ])
      .mockResolvedValue([
        { id: 101, type: "ASSET", reportGroup: "BANK", isActive: false, deletedAt: null },
        { id: 102, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
      ])
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toMatch(/nonaktif|tidak aktif/)
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    mocks.accountFindMany.mockReset()
  })

  it("R8-KEU-03: akun pembayaran bukan BANK atau uang muka bukan ASSET ditolak", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { id: 101, type: "ASSET", reportGroup: "OCAS", isActive: true, deletedAt: null },
      { id: 102, type: "LIABILITY", reportGroup: "APAY", isActive: true, deletedAt: null },
    ])
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("tidak sesuai")
    expect(mocks.checkIdempotency).not.toHaveBeenCalled()
    expect(mocks.advanceCreate).not.toHaveBeenCalled()
  })

  it("happy path: cek periode dalam tx mendahului pembuatan jurnal", async () => {
    const res = await createPurchaseAdvance(form(base))
    expect(res.success).toBe(true)
    expect(mocks.assertPeriodOpen).toHaveBeenCalledTimes(2)
    expect(mocks.assertPeriodOpen.mock.calls[1][0]).toEqual(new Date(Date.UTC(2026, 8, 15)))
    expect(mocks.assertPeriodOpen.mock.calls[1][1]).toBe(mocks.tx)
    expect(mocks.assertPeriodOpen.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.journalCreate.mock.invocationCallOrder[0],
    )
  })
})
