import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock: any = {
    customer: buildModelMock(),
    customerVehicle: buildModelMock(),
    vendor: buildModelMock(),
    item: buildModelMock(),
    itemCategory: buildModelMock(),
    warehouse: buildModelMock(),
    employee: buildModelMock(),
    account: buildModelMock(),
    department: buildModelMock(),
    position: buildModelMock(),
    lead: buildModelMock(),
    bank: buildModelMock(),
    tax: buildModelMock(),
    currency: buildModelMock(),
    barcode: buildModelMock(),
    taxGroup: buildModelMock(),
    taxGroupTax: buildModelMock(),
    statisticalKeyFigure: buildModelMock(),
    paymentTerm: buildModelMock(),
    brand: buildModelMock(),
    stockMovement: buildModelMock(),
    itemStock: buildModelMock(),
    user: buildModelMock(),
    role: buildModelMock(),
    uomConversion: buildModelMock(),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({ enableAutoCustomerCode: true }) }))
vi.mock("bcryptjs", () => {
  const m = {
    hash: vi.fn().mockResolvedValue("hash"),
    compare: vi.fn().mockResolvedValue(true),
  }
  return {
    ...m,
    default: m
  }
})

import * as actions from "../master.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a non-super_admin caller (e.g. an HR manager with edit_employees).
  mocks.requirePermissionMock.mockResolvedValue({
    id: 2,
    permissions: ["create_employees", "edit_employees"],
    roles: ["hr_manager"],
  })
  // By default, the role table returns the requested role names as-is.
  // For the "super_admin escalation" tests we override this to return a
  // super_admin role when the actor probes roleId=99.
  mocks.prismaMock.role.findMany.mockImplementation(async (args: any) => {
    const ids = (args?.where?.id?.in ?? []) as number[]
    return ids.map((id) => ({ name: id === 99 ? "super_admin" : `role_${id}` }))
  })
  mocks.prismaMock.user.create.mockResolvedValue({ id: 7 })
  mocks.prismaMock.user.update.mockResolvedValue({})
  mocks.prismaMock.employee.create.mockResolvedValue({ id: 5 })
  mocks.prismaMock.employee.update.mockResolvedValue({})
  mocks.prismaMock.employee.findUnique.mockResolvedValue({ userId: null })
  mocks.prismaMock.user.findUnique.mockResolvedValue(null)
})

describe("Privilege-escalation guard on Employee login account", () => {
  it("createEmployee refuses to mint a super_admin role when actor is not super_admin", async () => {
    // The form submits loginRoleIds=99 which the role table resolves to "super_admin".
    const fd = fdMap({
      name: "Eve",
      joinDate: "2026-06-13",
      createLoginAccount: "true",
      email: "eve@example.com",
      loginPassword: "password123",
    })
    fd.append("loginRoleIds", "99")

    const res = await actions.createEmployee(fd)
    expect(res?.success).toBe(false)
    // The user.create call must NOT have been made — escalation blocked at the
    // gate, not after the role was attached.
    expect(mocks.prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("updateEmployee refuses to set super_admin role on a new login account when actor is not super_admin", async () => {
    const fd = fdMap({
      name: "Mallory",
      joinDate: "2026-06-13",
      createLoginAccount: "true",
      email: "mallory@example.com",
      loginPassword: "password123",
    })
    fd.append("loginRoleIds", "99")

    const res = await actions.updateEmployee(1, fd)
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("updateEmployee refuses to sync super_admin role onto existing user when actor is not super_admin", async () => {
    // Employee already has a linked user; actor submits a role select with super_admin.
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 7 })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce(null) // no email clash

    const fd = fdMap({
      name: "Trent",
      joinDate: "2026-06-13",
      email: "trent@example.com",
    })
    fd.append("loginRoleIds", "99")

    const res = await actions.updateEmployee(1, fd)
    expect(res?.success).toBe(false)
    // The sync path must NOT have been executed.
    expect(mocks.prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("createEmployee allows non-super_admin roles when actor is not super_admin", async () => {
    // Sanity: the guard must not block benign role assignments.
    const fd = fdMap({
      name: "Bob",
      joinDate: "2026-06-13",
      createLoginAccount: "true",
      email: "bob@example.com",
      loginPassword: "password123",
    })
    fd.append("loginRoleIds", "5") // resolves to "role_5", not super_admin

    const res = await actions.createEmployee(fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.user.create).toHaveBeenCalled()
  })

  it("createEmployee allows super_admin role when the actor IS super_admin", async () => {
    // Sanity: super_admin can of course assign super_admin.
    mocks.requirePermissionMock.mockResolvedValueOnce({
      id: 1,
      permissions: ["create_employees"],
      roles: ["super_admin"],
    })
    const fd = fdMap({
      name: "Admin",
      joinDate: "2026-06-13",
      createLoginAccount: "true",
      email: "admin@example.com",
      loginPassword: "password123",
    })
    fd.append("loginRoleIds", "99")

    const res = await actions.createEmployee(fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.user.create).toHaveBeenCalled()
  })

  it("updateEmployee refuses to modify a target employee linked to a super_admin user when actor is not super_admin", async () => {
    // The employee has userId 7, which belongs to a super_admin user.
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 7 })
    // The target user has the super_admin role.
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 7,
      roles: [{ name: "super_admin" }],
    })

    const fd = fdMap({
      name: "Malicious HR Update",
      joinDate: "2026-06-13",
      email: "superadmin@company.com",
    })

    const res = await actions.updateEmployee(1, fd)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin")
    expect(mocks.prismaMock.employee.update).not.toHaveBeenCalled()
  })

  it("updateEmployee allows modifying a super_admin employee when actor IS super_admin", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({
      id: 1,
      permissions: ["edit_employees"],
      roles: ["super_admin"],
    })
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 7 })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 7,
      roles: [{ name: "super_admin" }],
    })

    const fd = fdMap({
      name: "Super Admin Self Update",
      joinDate: "2026-06-13",
      email: "superadmin@company.com",
    })

    const res = await actions.updateEmployee(1, fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.employee.update).toHaveBeenCalled()
  })
})
