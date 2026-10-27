import { describe, expect, it, vi, beforeEach } from "vitest"

const hasPermissionMock = vi.fn()

vi.mock("../permissions", () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}))

import {
  canViewCostAmounts,
  canViewSalaryAmounts,
  canViewSensitiveIdentity,
} from "../field-visibility"

describe("field visibility gates", () => {
  beforeEach(() => {
    hasPermissionMock.mockReset()
  })

  it("salary amounts require view_salary_amounts", async () => {
    hasPermissionMock.mockResolvedValue(false)
    await expect(canViewSalaryAmounts()).resolves.toBe(false)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_salary_amounts")

    hasPermissionMock.mockResolvedValue(true)
    await expect(canViewSalaryAmounts()).resolves.toBe(true)
  })

  it("sensitive identity requires view_sensitive_identity", async () => {
    hasPermissionMock.mockResolvedValue(false)
    await expect(canViewSensitiveIdentity()).resolves.toBe(false)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_sensitive_identity")

    hasPermissionMock.mockResolvedValue(true)
    await expect(canViewSensitiveIdentity()).resolves.toBe(true)
  })

  it("cost amounts require view_cost_amounts", async () => {
    hasPermissionMock.mockResolvedValue(false)
    await expect(canViewCostAmounts()).resolves.toBe(false)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_cost_amounts")

    hasPermissionMock.mockResolvedValue(true)
    await expect(canViewCostAmounts()).resolves.toBe(true)
  })
})
