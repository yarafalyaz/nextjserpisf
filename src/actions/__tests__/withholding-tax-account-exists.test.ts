import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const txFacade = {
    withholdingTaxType: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  }
  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    txFacade,
    prismaMock: {
      withholdingTaxType: txFacade.withholdingTaxType,
      account: {
        findFirst: vi.fn().mockResolvedValue({ id: 10 }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txFacade)),
    },
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn().mockResolvedValue("pph-23"),
  nextSlugWithClient: vi.fn().mockResolvedValue("pph-23"),
}))
const checkIdempotencyMock = vi.fn()
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: (...a: unknown[]) => checkIdempotencyMock(...a),
}))

import * as actions from "../withholding-tax.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

const BASE = { code: "PPH23", name: "PPh 23", rate: "2" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: [] })
  mocks.prismaMock.account.findFirst.mockResolvedValue({ id: 10 })
  mocks.prismaMock.withholdingTaxType.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.withholdingTaxType.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.withholdingTaxType.findMany.mockResolvedValue([])
  mocks.txFacade.$executeRaw.mockResolvedValue(1)
  checkIdempotencyMock.mockResolvedValue(undefined)
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
      expect.objectContaining({ where: { id: 10, deletedAt: null, isActive: true } }),
    )
  })

  // putaran 65: akun nonaktif ditolak di master; titik pakai juga menilai
  // akun hidup dalam tx, tetapi master beracun membuat transaksi sah
  // gagal berisik di titik pakai.
  it("putaran 65: create menolak akun kewajiban nonaktif", async () => {
    const res = await actions.createWithholdingTaxType(
      fd({ ...BASE, liabilityAccountId: "10" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10, deletedAt: null, isActive: true } }),
    )
  })

  it("putaran 65: update menolak akun PPh dibayar dimuka nonaktif", async () => {
    const res = await actions.updateWithholdingTaxType(
      5,
      fd({ ...BASE, receivableAccountId: "11" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 11, deletedAt: null, isActive: true } }),
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

  // regresi putaran 35: pasal + kode objek bisa ditulis (bupot mewajibkan pasal sah)
  it("create menulis pasal + kode objek ke baris jenis", async () => {
    const res = await actions.createWithholdingTaxType(
      fd({ ...BASE, article: "PPh23", objectCode: "24-104-01" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.withholdingTaxType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ article: "PPh23", objectCode: "24-104-01" }),
      }),
    )
  })

  it("create menolak pasal tak dikenal", async () => {
    const res = await actions.createWithholdingTaxType(fd({ ...BASE, article: "PPh99" }))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.withholdingTaxType.create).not.toHaveBeenCalled()
  })

  it("putaran 70: create double-submit ditolak: create hanya sekali", async () => {
    checkIdempotencyMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Permintaan duplikat terdeteksi."))
    const p = { ...BASE, idempotencyKey: "wht-key-1" }
    const first = await actions.createWithholdingTaxType(fd(p))
    expect(first.success).toBe(true)
    const second = await actions.createWithholdingTaxType(fd(p))
    expect(second.success).toBe(false)
    expect(String(second.error)).toContain("duplikat")
    expect(mocks.prismaMock.withholdingTaxType.create).toHaveBeenCalledTimes(1)
  })

  it("putaran 70: create mengklaim kode ternormalisasi dari daftar sibling", async () => {
    mocks.prismaMock.withholdingTaxType.findMany.mockResolvedValue([{ id: 2, code: "pph23 " }])
    const res = await actions.createWithholdingTaxType(fd({ ...BASE, code: " PPH23" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Kode PPh")
    expect(res.error).not.toContain("Unique constraint")
    expect(mocks.prismaMock.withholdingTaxType.create).not.toHaveBeenCalled()
  })

  it("putaran 70: update mengklaim kode ternormalisasi dari daftar sibling", async () => {
    mocks.prismaMock.withholdingTaxType.findMany.mockResolvedValue([{ id: 2, code: "PPH23" }])
    const res = await actions.updateWithholdingTaxType(5, fd({ ...BASE, code: " pph23 " }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Kode PPh")
    expect(mocks.prismaMock.withholdingTaxType.update).not.toHaveBeenCalled()
  })

  it("update menulis pasal + kode objek", async () => {
    const res = await actions.updateWithholdingTaxType(
      5, fd({ ...BASE, article: "PPh4(2)", objectCode: "28-403-02" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.withholdingTaxType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ article: "PPh4(2)", objectCode: "28-403-02" }),
      }),
    )
  })
})
