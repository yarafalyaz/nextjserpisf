import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => mocks.getSystemSettings(...a),
}))

import { GET } from "../route"

const SETTINGS = {
  companyName: "ISF",
  companyAddress: "Jl. A",
  companyVillage: "Kel",
  companyDistrict: "Kec",
  companyCity: "Kota",
  companyProvince: "Prov",
  companyPhone: "021",
  companyEmail: "a@b.id",
  companyWebsite: "https://x.id",
  companyLogo: null,
  companyPostalCode: "12345",
  // Field internal: TIDAK boleh bocor ke respons publik.
  salesReceivableAccountId: 99,
  periodLockDate: new Date("2026-01-01"),
}

describe("GET /api/system-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockResolvedValue(true)
    mocks.authFn.mockResolvedValue({ user: { name: "Rani", email: "rani@x.id" } })
    mocks.getSystemSettings.mockResolvedValue({ ...SETTINGS })
  })

  it("returns 403 and does not read settings without view_dashboard", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "FORBIDDEN" })
    expect(mocks.hasPermission).toHaveBeenCalledWith("view_dashboard")
    expect(mocks.getSystemSettings).not.toHaveBeenCalled()
  })

  it("returns only company identity fields, no internal settings", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.companyName).toBe("ISF")
    expect(body.companyEmail).toBe("a@b.id")
    expect(body).not.toHaveProperty("salesReceivableAccountId")
    expect(body).not.toHaveProperty("periodLockDate")
    expect(Object.keys(body).sort()).toEqual(
      [
        "companyAddress",
        "companyCity",
        "companyDistrict",
        "companyEmail",
        "companyLogo",
        "companyName",
        "companyPhone",
        "companyPostalCode",
        "companyProvince",
        "companyVillage",
        "companyWebsite",
        "printedBy",
      ].sort(),
    )
  })

  it("returns printedBy from session name, falling back to email", async () => {
    const res = await GET()
    expect((await res.json()).printedBy).toBe("Rani")
    mocks.authFn.mockResolvedValueOnce({ user: { email: "rani@x.id" } })
    expect((await (await GET()).json()).printedBy).toBe("rani@x.id")
    mocks.authFn.mockResolvedValueOnce({ user: {} })
    expect((await (await GET()).json()).printedBy).toBeNull()
    mocks.authFn.mockResolvedValueOnce(null)
    expect((await (await GET()).json()).printedBy).toBeNull()
  })

  it("returns 500 with apiError shape when settings load fails", async () => {
    mocks.getSystemSettings.mockRejectedValue(new Error("db down"))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" })
    expect(body.error.message).not.toContain("db down")
    expect(body.companyName).toBeUndefined()
  })

  it("returns 500 (not 403) when permission check itself throws", async () => {
    mocks.hasPermission.mockRejectedValue(new Error("session store down"))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" })
  })
})
