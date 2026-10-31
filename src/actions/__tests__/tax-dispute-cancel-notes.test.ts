import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    taxAssessment: {
      findFirst: (...a: unknown[]) => mocks.findFirst(...a),
    },
    $transaction: (...a: unknown[]) => mocks.transaction(...a),
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { cancelTaxAssessment } from "../tax-dispute.actions"

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7" })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.executeRaw.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      taxAssessment: {
        findFirst: (...a: unknown[]) => mocks.findFirst(...a),
        updateMany: (...a: unknown[]) => mocks.updateMany(...a),
      },
      $executeRaw: (...a: unknown[]) => mocks.executeRaw(...a),
    }),
  )
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("cancelTaxAssessment — notes asli tidak ditimpa", () => {
  it("alasan batal ditambahkan di belakang notes asli dengan penanda", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "TERDAFTAR", notes: "Keterangan register awal" })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "SKP dicabut DJP" }))
    expect(result.success).toBe(true)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 3, deletedAt: null, status: { notIn: ["BATAL", "SELESAI"] } },
      data: {
        status: "BATAL",
        deletedAt: expect.any(Date),
        notes: "Keterangan register awal\n[Batal: SKP dicabut DJP]",
      },
    })
  })

  it("status SELESAI ditolak di server, update tak dipanggil", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "SELESAI", notes: null })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "Salah catat" }))
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("selesai/batal")
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("status BATAL ditolak di server, update tak dipanggil", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "BATAL", notes: null })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "Salah catat" }))
    expect(result.success).toBe(false)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("notes kosong → hanya penanda batal", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "TERDAFTAR", notes: null })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "Salah catat" }))
    expect(result.success).toBe(true)
    expect(mocks.updateMany.mock.calls[0]![0].data.notes).toBe("[Batal: Salah catat]")
  })
})

  it("R8-PAJAK-11: klaim kalah race (count 0) ditolak walau baca awal tampak bisa dibatal", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "TERDAFTAR", notes: null })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "Salah catat" }))
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("selesai/batal")
  })
