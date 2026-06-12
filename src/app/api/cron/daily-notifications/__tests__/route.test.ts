import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  userFindMany: vi.fn(),
  queryRaw: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  purchaseOrderFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  holidayFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  leaveRequestFindMany: vi.fn(),
  notifyAdmins: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyAdmins: (...a: unknown[]) => mocks.notifyAdmins(...a),
  },
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => mocks.userFindMany(...a) },
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    salesInvoice: { findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a) },
    purchaseOrder: { findMany: (...a: unknown[]) => mocks.purchaseOrderFindMany(...a) },
    attendance: { findMany: (...a: unknown[]) => mocks.attendanceFindMany(...a) },
    holiday: { findFirst: (...a: unknown[]) => mocks.holidayFindFirst(...a) },
    employee: { findMany: (...a: unknown[]) => mocks.employeeFindMany(...a) },
    leaveRequest: { findMany: (...a: unknown[]) => mocks.leaveRequestFindMany(...a) },
  },
}))

function makeReq(): Request {
  return new Request("http://localhost/api/cron/daily-notifications", {
    headers: { authorization: "Bearer ***REMOVED***" },
  })
}

describe("GET /api/cron/daily-notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isValidCron.mockReturnValue(true)
    mocks.userFindMany.mockResolvedValue([{ id: 1 }])
    mocks.queryRaw.mockResolvedValue([])
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.purchaseOrderFindMany.mockResolvedValue([])
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.holidayFindFirst.mockResolvedValue(null)
    mocks.employeeFindMany.mockResolvedValue([])
    mocks.leaveRequestFindMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 401 when cron auth invalid", async () => {
    mocks.isValidCron.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it("returns early when no active admins", async () => {
    mocks.userFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.message).toBe("No active admins found.")
  })

  it("returns 500 on internal error", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })

  it("notifies low stock items (with >5 truncation)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00")) // before 10am, skip absent
    mocks.queryRaw.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: i, name: `Item${i}`, qty_on_hand: 1, min_stock: 10 }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lowStock).toBe(7)
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.stringContaining("7 Barang"),
      expect.stringContaining("lainnya"),
      "warning"
    )
  })

  it("notifies overdue invoices", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.salesInvoiceFindMany.mockResolvedValue([
      { grandTotal: 1000, paidAmount: 200 },
      { grandTotal: 500, paidAmount: 0 },
    ])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.overdueInvoices).toBe(2)
  })

  it("notifies stale POs", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.purchaseOrderFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.stalePOs).toBe(2)
  })

  it("notifies late attendances (with >5 truncation and unknown name)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.attendanceFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ employee: i === 0 ? null : { name: `Emp${i}` } }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lateAttendance).toBe(6)
  })

  it("notifies absent employees after 10am (skips present and on-leave)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.employeeFindMany.mockResolvedValue([
      { id: 1, name: "A", department: { name: "IT" } },
      { id: 2, name: "B", department: null },
      { id: 3, name: "C", department: { name: "HR" } },
    ])
    mocks.attendanceFindMany.mockResolvedValue([{ employeeId: 1 }]) // emp 1 present
    mocks.leaveRequestFindMany.mockResolvedValue([{ employeeId: 2 }]) // emp 2 on leave
    // emp 3 absent
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.absentEmployees).toBe(1)
  })

  it("skips absent check on holiday", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.holidayFindFirst.mockResolvedValue({ id: 1 })
    mocks.employeeFindMany.mockResolvedValue([{ id: 1, name: "A", department: null }])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.absentEmployees).toBeUndefined()
  })

  it("returns success summary with adminsNotified count", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.userFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.message).toBe("Daily notifications sent.")
    expect(json.adminsNotified).toBe(2)
  })

  it("absent with >5 employees truncates list", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.employeeFindMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: i, name: `E${i}`, department: null }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.absentEmployees).toBe(7)
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.stringContaining("7 Karyawan Belum Absen"),
      expect.stringContaining("lainnya"),
      "danger"
    )
  })
})
