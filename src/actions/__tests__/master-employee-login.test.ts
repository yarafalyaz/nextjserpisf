import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const getSystemSettingsMock = vi.fn()
const generateDocMock = vi.fn()
const logActivityMock = vi.fn()
const revalidateMock = vi.fn()
const bcryptHashMock = vi.fn()

const userFindUniqueMock = vi.fn()
const userUpdateMock = vi.fn()
const employeeFindUniqueMock = vi.fn()
const employeeDeleteMock = vi.fn()
const employeeUpdateMock = vi.fn()
const txUserCreateMock = vi.fn()
const txEmployeeCreateMock = vi.fn()
const txEmployeeUpdateMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocMock(...a),
  peekNextDocumentNumber: vi.fn(),
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => getSystemSettingsMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))
vi.mock("bcryptjs", () => ({
  default: { hash: (...a: unknown[]) => bcryptHashMock(...a) },
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUniqueMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
    employee: {
      findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a),
      delete: (...a: unknown[]) => employeeDeleteMock(...a),
      update: (...a: unknown[]) => employeeUpdateMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))

import { createEmployee, updateEmployee, deleteEmployee } from "../master.actions"

// FormData builder
function fd(fields: Record<string, string>, multi?: Record<string, string[]>) {
  const f = new FormData()
  Object.entries(fields).forEach(([k, v]) => f.append(k, v))
  if (multi) Object.entries(multi).forEach(([k, vals]) => vals.forEach((v) => f.append(k, v)))
  return f
}

const baseFields = {
  name: "Budi Santoso",
  joinDate: "2026-01-15",
  paymentFrequency: "MONTHLY",
  baseSalary: "5000000",
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: "1" })
  getSystemSettingsMock.mockResolvedValue({ enableAutoEmployeeCode: true })
  generateDocMock.mockResolvedValue("EMP-0001")
  bcryptHashMock.mockResolvedValue("hashed-pw")
  logActivityMock.mockResolvedValue(undefined)
  // $transaction runs the callback with a tx stub
  transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      user: { create: (...a: unknown[]) => txUserCreateMock(...a) },
      employee: {
        create: (...a: unknown[]) => txEmployeeCreateMock(...a),
        update: (...a: unknown[]) => txEmployeeUpdateMock(...a),
      },
    })
  )
})

describe("createEmployee — without login account", () => {
  it("creates an employee only, never touches user.create", async () => {
    txEmployeeCreateMock.mockResolvedValue({ id: 42 })
    const res = await createEmployee(fd(baseFields))

    expect(res).toEqual({ success: true, id: 42 })
    expect(txUserCreateMock).not.toHaveBeenCalled()
    expect(bcryptHashMock).not.toHaveBeenCalled()
    // employee created without userId
    const arg = txEmployeeCreateMock.mock.calls[0][0]
    expect(arg.data.userId).toBeUndefined()
    expect(arg.data.name).toBe("Budi Santoso")
  })
})

describe("createEmployee — with login account", () => {
  it("creates a user (bcrypt) + employee linked via userId, connecting roles", async () => {
    userFindUniqueMock.mockResolvedValue(null) // email free
    txUserCreateMock.mockResolvedValue({ id: 7 })
    txEmployeeCreateMock.mockResolvedValue({ id: 99 })

    const res = await createEmployee(
      fd(
        { ...baseFields, email: "budi@corp.id", createLoginAccount: "true", loginPassword: "rahasia123" },
        { loginRoleIds: ["3", "5"] }
      )
    )

    expect(res).toEqual({ success: true, id: 99 })
    expect(bcryptHashMock).toHaveBeenCalledWith("rahasia123", 12)
    // user created with hashed password + role connect
    const userArg = txUserCreateMock.mock.calls[0][0]
    expect(userArg.data.email).toBe("budi@corp.id")
    expect(userArg.data.password).toBe("hashed-pw")
    expect(userArg.data.roles.connect).toEqual([{ id: 3 }, { id: 5 }])
    // employee linked to the new user
    const empArg = txEmployeeCreateMock.mock.calls[0][0]
    expect(empArg.data.userId).toBe(7)
  })

  it("rejects when login requested but email missing", async () => {
    const res = await createEmployee(fd({ ...baseFields, createLoginAccount: "true", loginPassword: "rahasia123" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/email/i)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("rejects when login password is shorter than 8 chars", async () => {
    const res = await createEmployee(fd({ ...baseFields, email: "x@y.z", createLoginAccount: "true", loginPassword: "short" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/8 karakter/i)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("rejects when email already belongs to an existing user", async () => {
    userFindUniqueMock.mockResolvedValue({ id: 1, email: "dup@corp.id" })
    const res = await createEmployee(
      fd({ ...baseFields, email: "dup@corp.id", createLoginAccount: "true", loginPassword: "rahasia123" })
    )
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah terdaftar/i)
    expect(transactionMock).not.toHaveBeenCalled()
  })
})

describe("createEmployee — permission guard", () => {
  it("returns an error result when permission is denied", async () => {
    requirePermissionMock.mockImplementation(async () => {
      throw new Error("Akses ditolak")
    })
    const res = await createEmployee(fd(baseFields))
    expect(res.success).toBe(false)
    expect(txEmployeeCreateMock).not.toHaveBeenCalled()
  })
})

describe("updateEmployee — create login account for existing employee", () => {
  it("creates a user + links it to the employee via update when none exists", async () => {
    employeeFindUniqueMock.mockResolvedValue({ userId: null }) // no account yet
    userFindUniqueMock.mockResolvedValue(null) // email free
    txUserCreateMock.mockResolvedValue({ id: 11 })
    txEmployeeUpdateMock.mockResolvedValue({ id: 50 })

    const res = await updateEmployee(
      50,
      fd(
        { ...baseFields, email: "siti@corp.id", createLoginAccount: "true", loginPassword: "rahasia123" },
        { loginRoleIds: ["2"] }
      )
    )

    expect(res).toEqual({ success: true })
    expect(bcryptHashMock).toHaveBeenCalledWith("rahasia123", 12)
    const userArg = txUserCreateMock.mock.calls[0][0]
    expect(userArg.data.roles.connect).toEqual([{ id: 2 }])
    const empArg = txEmployeeUpdateMock.mock.calls[0][0]
    expect(empArg.where).toEqual({ id: 50 })
    expect(empArg.data.userId).toBe(11)
  })

  it("rejects when the employee already has a login account", async () => {
    employeeFindUniqueMock.mockResolvedValue({ userId: 99 })
    const res = await updateEmployee(
      50,
      fd({ ...baseFields, email: "siti@corp.id", createLoginAccount: "true", loginPassword: "rahasia123" })
    )
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah memiliki akun/i)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("updates the employee normally when no login account requested", async () => {
    txEmployeeUpdateMock.mockResolvedValue({ id: 50 })
    const res = await updateEmployee(50, fd(baseFields))
    expect(res).toEqual({ success: true })
    expect(txUserCreateMock).not.toHaveBeenCalled()
    const empArg = txEmployeeUpdateMock.mock.calls[0][0]
    expect(empArg.data.userId).toBeUndefined()
  })
})

describe("deleteEmployee — revoke linked login account", () => {
  it("deactivates the linked user account when the employee is deleted", async () => {
    employeeFindUniqueMock.mockResolvedValue({ userId: 7 })
    employeeDeleteMock.mockResolvedValue({ id: 50 }) // hard delete succeeds
    userUpdateMock.mockResolvedValue({ id: 7 })

    const res = await deleteEmployee(50)

    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalledWith({ where: { id: 7 }, data: { isActive: false } })
  })

  it("does not touch any user when the employee has no login account", async () => {
    employeeFindUniqueMock.mockResolvedValue({ userId: null })
    employeeDeleteMock.mockResolvedValue({ id: 51 })

    const res = await deleteEmployee(51)

    expect(res).toEqual({ success: true })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })
})
