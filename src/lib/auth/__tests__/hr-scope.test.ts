import { describe, expect, it, vi, beforeEach } from "vitest"

const employeeFindFirst = vi.fn()
const employeeFindUnique = vi.fn()
const employeeFindMany = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: {
      findFirst: (...args: unknown[]) => employeeFindFirst(...args),
      findUnique: (...args: unknown[]) => employeeFindUnique(...args),
      findMany: (...args: unknown[]) => employeeFindMany(...args),
    },
  },
}))

import { assertHrEmployeeAccess, getHrScope, hrScopeWhere } from "../hr-scope"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("HR data scope", () => {
  it("limits ordinary users to their own employee record", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 3 })
    const scope = await getHrScope({ id: "11", roles: ["employee"] })

    expect(hrScopeWhere(scope)).toEqual({ employeeId: 7 })
    await expect(assertHrEmployeeAccess(scope, 7)).resolves.toBeUndefined()
    await expect(assertHrEmployeeAccess(scope, 8)).rejects.toThrow("tidak memiliki akses")
  })

  it("limits department managers to employees in their department", async () => {
    employeeFindFirst.mockResolvedValue({ id: 7, departmentId: 3 })
    const scope = await getHrScope({ id: "11", roles: ["kepala_bengkel"] })
    employeeFindUnique.mockResolvedValueOnce({ departmentId: 3 })
    await expect(assertHrEmployeeAccess(scope, 8)).resolves.toBeUndefined()

    employeeFindUnique.mockResolvedValueOnce({ departmentId: 4 })
    await expect(assertHrEmployeeAccess(scope, 9)).rejects.toThrow("tidak memiliki akses")
  })

  it("structural authorization: team scope follows the manager chain recursively", async () => {
    employeeFindFirst.mockResolvedValue({ id: 1, departmentId: 2 })
    employeeFindMany
      .mockResolvedValueOnce([{ id: 2 }, { id: 3 }])
      .mockResolvedValueOnce([{ id: 4 }])
      .mockResolvedValueOnce([])

    const scope = await getHrScope({
      id: "11",
      roles: ["staff"],
      permissions: ["view_subordinate_data"],
    })

    expect(scope.kind).toBe("team")
    expect(hrScopeWhere(scope)).toEqual({ employeeId: { in: [1, 2, 3, 4] } })
    await expect(assertHrEmployeeAccess(scope, 4)).resolves.toBeUndefined()
    await expect(assertHrEmployeeAccess(scope, 9)).rejects.toThrow(
      "tidak memiliki akses",
    )
  })

  it("without view_subordinate_data the same user stays self-scoped", async () => {
    employeeFindFirst.mockResolvedValue({ id: 1, departmentId: 2 })
    const scope = await getHrScope({ id: "11", roles: ["staff"], permissions: [] })
    expect(scope.kind).toBe("self")
    expect(employeeFindMany).not.toHaveBeenCalled()
  })

  it("allows designated HR roles across employees", async () => {
    const scope = await getHrScope({ id: "11", roles: ["finance"] })
    await expect(assertHrEmployeeAccess(scope, 999)).resolves.toBeUndefined()
    expect(employeeFindUnique).not.toHaveBeenCalled()
  })
})
