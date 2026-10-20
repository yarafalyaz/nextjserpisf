import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  revalidateMock: vi.fn(),
  logActivityMock: vi.fn(),
  prismaMock: {
    position: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    department: {
      findFirst: vi.fn().mockResolvedValue({ id: 7 }),
    },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("POS-001") }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("manager") }))
vi.mock("@/lib/auth/hr-scope", () => ({ getHrScope: vi.fn().mockResolvedValue(null) }))
vi.mock("bcryptjs", () => {
  const m = { hash: vi.fn().mockResolvedValue("hash"), compare: vi.fn().mockResolvedValue(true) }
  return { ...m, default: m }
})

import * as actions from "../master.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.position.findFirst.mockResolvedValue(null)
  mocks.prismaMock.position.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.position.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.department.findFirst.mockResolvedValue({ id: 7 })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("Position departmentId wajib ada", () => {
  it("create tolak departmentId fiktif, tanpa create", async () => {
    mocks.prismaMock.department.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createPosition(fd({ name: "Manager", departmentId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Departemen tidak ditemukan/)
    expect(mocks.prismaMock.position.create).not.toHaveBeenCalled()
  })

  it("create lolos bila departemen ada, departmentId diteruskan", async () => {
    const res = await actions.createPosition(fd({ name: "Manager", departmentId: "7" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.position.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: 7 }) }),
    )
  })

  it("create tanpa departemen tetap lolos (opsional)", async () => {
    const res = await actions.createPosition(fd({ name: "Manager" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.department.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.position.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) }),
    )
  })

  it("update tolak departmentId fiktif, tanpa update", async () => {
    mocks.prismaMock.department.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updatePosition(1, fd({ name: "Manager", departmentId: "999" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Departemen tidak ditemukan/)
    expect(mocks.prismaMock.position.update).not.toHaveBeenCalled()
  })

  it("update lolos bila departemen ada", async () => {
    const res = await actions.updatePosition(1, fd({ name: "Manager", departmentId: "7" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.position.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: 7 }) }),
    )
  })
})
