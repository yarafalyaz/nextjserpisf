import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  revalidateMock: vi.fn(),
  logActivityMock: vi.fn(),
  prismaMock: {
    withholdingTaxType: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: 10 }),
    },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("pph-23") }))

import * as actions from "../withholding-tax.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

const BASE = { code: "PPH23", name: "PPh 23", rate: "2" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.account.findFirst.mockResolvedValue({ id: 10 })
  mocks.prismaMock.withholdingTaxType.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.withholdingTaxType.update.mockResolvedValue({ id: 1 })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("WithholdingTaxType akun FK wajib ada", () => {
  it("create tolak liabilityAccountId tak ada, tanpa create", async () => {
    mocks.prismaMock.account.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createWithholdingTaxType(fd({ ...BASE, liabilityAccountId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Hutang PPh/)
    expect(mocks.prismaMock.withholdingTaxType.create).not.toHaveBeenCalled()
  })

  it("create tolak receivableAccountId tak ada, tanpa create", async () => {
    mocks.prismaMock.account.findFirst
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(null)
    const res = await actions.createWithholdingTaxType(
      fd({ ...BASE, liabilityAccountId: "10", receivableAccountId: "888" }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/dibayar dimuka/)
    expect(mocks.prismaMock.withholdingTaxType.create).not.toHaveBeenCalled()
  })

  it("create lolos bila kedua akun ada", async () => {
    const res = await actions.createWithholdingTaxType(
      fd({ ...BASE, liabilityAccountId: "10", receivableAccountId: "11" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.withholdingTaxType.create).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10, deletedAt: null } }),
    )
  })

  it("create tanpa akun tetap lolos (opsional)", async () => {
    const res = await actions.createWithholdingTaxType(fd(BASE))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.account.findFirst).not.toHaveBeenCalled()
  })

  it("update tolak akun tak ada, tanpa update", async () => {
    mocks.prismaMock.account.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updateWithholdingTaxType(5, fd({ ...BASE, receivableAccountId: "777" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/dibayar dimuka/)
    expect(mocks.prismaMock.withholdingTaxType.update).not.toHaveBeenCalled()
  })
})
