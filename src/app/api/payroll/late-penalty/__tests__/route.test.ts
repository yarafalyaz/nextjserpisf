import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  calculateLatePenalty: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/services/late-penalty.service", () => ({
  calculateLatePenalty: (...a: unknown[]) => mocks.calculateLatePenalty(...a),
}))

describe("GET /api/payroll/late-penalty", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty"))
    expect(res.status).toBe(401)
  })

  it("returns 403 when user lacks view_payroll", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=2026-01-01&tanggalSelesai=2026-01-31"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when params missing", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid date", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=bad&tanggalSelesai=2026-01-31"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when start > end", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=2026-12-31&tanggalSelesai=2026-01-01"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when range > 90 days", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=2025-01-01&tanggalSelesai=2026-12-31"))
    expect(res.status).toBe(400)
  })

  it("returns 200 with penalty calculation", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    mocks.calculateLatePenalty.mockResolvedValue({
      totalLateMinutes: 45,
      totalPenalty: 25000,
      details: [
        {
          date: new Date("2026-01-15"),
          scheduledStart: "08:00",
          actualCheckIn: new Date("2026-01-15T08:30:00Z"),
          lateMinutes: 30,
          penalty: 15000,
        },
      ],
    })

    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=2026-01-01&tanggalSelesai=2026-01-31"))
    const json = await res.json()
    expect(json.totalLateMinutes).toBe(45)
    expect(json.totalPenalty).toBe(25000)
    expect(json.lateDays).toBe(1)
    expect(json.details[0].date).toBe("2026-01-15")
  })

  it("returns 500 on internal error", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    mocks.calculateLatePenalty.mockRejectedValue(new Error("boom"))
    const res = await GET(new NextRequest("http://localhost/api/payroll/late-penalty?karyawanId=1&tanggalMulai=2026-01-01&tanggalSelesai=2026-01-31"))
    expect(res.status).toBe(500)
  })
})
