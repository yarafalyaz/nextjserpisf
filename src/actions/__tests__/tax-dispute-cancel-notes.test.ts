import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    taxAssessment: {
      findFirst: (...a: unknown[]) => mocks.findFirst(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
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
  mocks.update.mockResolvedValue({})
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("cancelTaxAssessment — notes asli tidak ditimpa", () => {
  it("alasan batal ditambahkan di belakang notes asli dengan penanda", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "TERDAFTAR", notes: "Keterangan register awal" })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "SKP dicabut DJP" }))
    expect(result.success).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        status: "BATAL",
        deletedAt: expect.any(Date),
        notes: "Keterangan register awal\n[Batal: SKP dicabut DJP]",
      },
    })
  })

  it("notes kosong → hanya penanda batal", async () => {
    mocks.findFirst.mockResolvedValue({ id: 3, status: "TERDAFTAR", notes: null })
    const result = await cancelTaxAssessment(fd({ id: "3", reason: "Salah catat" }))
    expect(result.success).toBe(true)
    expect(mocks.update.mock.calls[0]![0].data.notes).toBe("[Batal: Salah catat]")
  })
})
