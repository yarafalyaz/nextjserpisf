import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  userFindMany: vi.fn(),
  queryRaw: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  salesInvoiceCount: vi.fn(),
  salesInvoiceAggregate: vi.fn(),
  purchaseOrderFindMany: vi.fn(),
  purchaseOrderCount: vi.fn(),
  attendanceFindMany: vi.fn(),
  attendanceCount: vi.fn(),
  holidayFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  leaveRequestFindMany: vi.fn(),
  workScheduleFindMany: vi.fn(),
  holidayFindMany: vi.fn(),
  departmentHolidayFindMany: vi.fn(),
  notifyUsersIfNew: vi.fn(),
  notifyUsersIfNewBatch: vi.fn(),
  notificationFindFirst: vi.fn(),
  itemFindMany: vi.fn(),
  itemWarehouseSettingFindMany: vi.fn(),
  inventoryLayerFindMany: vi.fn(),
  warehouseFindMany: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyUsersIfNew: (...a: unknown[]) => mocks.notifyUsersIfNew(...a),
    notifyUsersIfNewBatch: (...a: unknown[]) => mocks.notifyUsersIfNewBatch(...a),
  },
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => mocks.userFindMany(...a) },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    itemWarehouseSetting: { findMany: (...a: unknown[]) => mocks.itemWarehouseSettingFindMany(...a) },
    inventoryLayer: { findMany: (...a: unknown[]) => mocks.inventoryLayerFindMany(...a) },
    warehouse: { findMany: (...a: unknown[]) => mocks.warehouseFindMany(...a) },
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    salesInvoice: {
      findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a),
      count: (...a: unknown[]) => mocks.salesInvoiceCount(...a),
      aggregate: (...a: unknown[]) => mocks.salesInvoiceAggregate(...a),
    },
    notification: { findFirst: (...a: unknown[]) => mocks.notificationFindFirst(...a) },
    purchaseOrder: {
      findMany: (...a: unknown[]) => mocks.purchaseOrderFindMany(...a),
      count: (...a: unknown[]) => mocks.purchaseOrderCount(...a),
    },
    attendance: {
      findMany: (...a: unknown[]) => mocks.attendanceFindMany(...a),
      count: (...a: unknown[]) => mocks.attendanceCount(...a),
    },
    employee: { findMany: (...a: unknown[]) => mocks.employeeFindMany(...a) },
    workSchedule: { findMany: (...a: unknown[]) => mocks.workScheduleFindMany(...a) },
    departmentHoliday: { findMany: (...a: unknown[]) => mocks.departmentHolidayFindMany(...a) },
    holiday: {
      findFirst: (...a: unknown[]) => mocks.holidayFindFirst(...a),
      findMany: (...a: unknown[]) => mocks.holidayFindMany(...a),
    },
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
    mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      // The route issues two raw queries: the low-stock sample (SELECT ... items)
      // and its COUNT. Return the sample list for the former, a count row for the
      // latter, based on the SQL text.
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings)
      return Promise.resolve(sql.includes("COUNT(") ? [{ count: BigInt(1) }] : [])
    })
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.salesInvoiceCount.mockResolvedValue(0)
    mocks.salesInvoiceAggregate.mockResolvedValue({ _sum: { grandTotal: 0, paidAmount: 0 } })
    mocks.purchaseOrderFindMany.mockResolvedValue([])
    mocks.purchaseOrderCount.mockResolvedValue(0)
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.attendanceCount.mockResolvedValue(0)
    mocks.holidayFindFirst.mockResolvedValue(null)
    mocks.employeeFindMany.mockResolvedValue([])
    mocks.leaveRequestFindMany.mockResolvedValue([])
    mocks.workScheduleFindMany.mockResolvedValue([])
    mocks.holidayFindMany.mockResolvedValue([])
    mocks.departmentHolidayFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.itemWarehouseSettingFindMany.mockResolvedValue([])
    mocks.inventoryLayerFindMany.mockResolvedValue([])
    mocks.warehouseFindMany.mockResolvedValue([])
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
    expect(json.message).toBe("Tidak ada admin aktif.")
  })

  it("returns 500 on internal error", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })

  it("notifies low stock items (with >5 truncation)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00")) // before 10am, skip absent
    mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings)
      const sample = Array.from({ length: 7 }, (_, i) => ({ id: i, name: `Item${i}`, qty_on_hand: 1, min_stock: 10 }))
      return Promise.resolve(sql.includes("COUNT(") ? [{ count: BigInt(7) }] : sample)
    })
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lowStock).toBe(7)
    expect(mocks.notifyUsersIfNew).toHaveBeenCalledWith(
      [1],
      expect.stringContaining("7 Barang"),
      expect.stringContaining("lainnya"),
      "warning",
      expect.any(Date)
    )
  })

  it("notifies overdue invoices", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.salesInvoiceFindMany.mockResolvedValue([
      { grandTotal: 1000, paidAmount: 200 },
      { grandTotal: 500, paidAmount: 0 },
    ])
    mocks.salesInvoiceCount.mockResolvedValue(2)
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.overdueInvoices).toBe(2)
  })

  it("overdue total uang dari aggregate semua faktur, bukan sampel take:20", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    // count=25 tapi findMany hanya sampel 2 baris (take:20 di route);
    // total piutang wajib dari aggregate seluruh where, bukan reduce sampel.
    mocks.salesInvoiceFindMany.mockResolvedValue([
      { grandTotal: 1000, paidAmount: 200 },
      { grandTotal: 500, paidAmount: 0 },
    ])
    mocks.salesInvoiceCount.mockResolvedValue(25)
    mocks.salesInvoiceAggregate.mockResolvedValue({ _sum: { grandTotal: 100000, paidAmount: 25000 } })
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.overdueInvoices).toBe(25)
    const call = mocks.notifyUsersIfNew.mock.calls.find((c) => String(c[1]).includes("Invoice Jatuh Tempo"))
    expect(call).toBeDefined()
    expect(String(call![2])).toContain("75.000")
  })

  it("notifies stale POs", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.purchaseOrderCount.mockResolvedValue(2)
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.stalePOs).toBe(2)
  })

  it("judul PO macet dari count penuh, bukan sampel findMany take:20", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    // Regresi: count = findMany(take:20).length berhenti di 20.
    mocks.purchaseOrderCount.mockResolvedValue(47)
    mocks.purchaseOrderFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: i + 1 })),
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.stalePOs).toBe(47)
    const call = mocks.notifyUsersIfNew.mock.calls.find((c) => String(c[1]).includes("PO Belum Diterima"))
    expect(call).toBeDefined()
    expect(String(call![1])).toContain("47 PO")
  })

  it("notifies late attendances (with >5 truncation and unknown name)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.attendanceCount.mockResolvedValue(6)
    mocks.attendanceFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ employeeId: i + 1, status: "late", lateMinutes: 1, employee: i === 0 ? null : { name: `Emp${i}` } }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lateAttendance).toBe(6)
  })

  it("judul + sisa karyawan telat dari count penuh, bukan sampel take:20", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    // Regresi: 35 telat tertulis "20 Karyawan Telat ... dan 15 lainnya".
    mocks.attendanceCount.mockResolvedValue(35)
    mocks.attendanceFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ employeeId: i + 1, status: "late", lateMinutes: 1, employee: { name: `Emp${i}` } }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lateAttendance).toBe(35)
    const call = mocks.notifyUsersIfNew.mock.calls.find((c) => String(c[1]).includes("Karyawan Telat"))
    expect(call).toBeDefined()
    expect(String(call![1])).toContain("35 Karyawan Telat")
    expect(String(call![2])).toContain("dan 30 lainnya")
  })

  it("notifies absent employees after 10am (skips present and on-leave)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.employeeFindMany.mockResolvedValue([
      { id: 1, name: "A", departmentId: 1, workSchedules: [], department: { id: 1, name: "IT", workSchedules: [] } },
      { id: 2, name: "B", departmentId: null, workSchedules: [], department: null },
      { id: 3, name: "C", departmentId: 2, workSchedules: [], department: { id: 2, name: "HR", workSchedules: [] } },
    ])
    mocks.attendanceFindMany.mockResolvedValue([{ employeeId: 1, status: "present", lateMinutes: 0 }]) // emp 1 present
    mocks.leaveRequestFindMany.mockResolvedValue([{ employeeId: 2 }]) // emp 2 on leave
    // emp 3 absent
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.absentEmployees).toBe(1)
  })

  it("skips absent check on holiday", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.holidayFindMany.mockResolvedValue([{ date: new Date("2026-06-12T00:00:00") }])
    mocks.employeeFindMany.mockResolvedValue([{ id: 1, name: "A", departmentId: null, workSchedules: [], department: null }])
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
    expect(json.message).toBe("Notifikasi harian terkirim.")
    expect(json.adminsNotified).toBe(2)
  })

  it("absent with >5 employees truncates list", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00"))
    mocks.employeeFindMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: i, name: `E${i}`, departmentId: null, workSchedules: [], department: null }))
    )
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.absentEmployees).toBe(7)
    expect(mocks.notifyUsersIfNew).toHaveBeenCalledWith(
      [1],
      expect.stringContaining("7 Karyawan Belum Absen"),
      expect.stringContaining("lainnya"),
      "danger",
      expect.any(Date)
    )
  })

  it("looks up admins exactly once even when every notification category fires", async () => {
    // Regression: previously the route pre-fetched admins at the top AND each
    // notifyAdmins(...) call internally re-queried the same user list, yielding
    // up to 5 redundant `prisma.user.findMany` round-trips per cron pass. Now
    // the pre-fetched admin IDs are reused via notifyUsersIfNew, so the user lookup
    // must be called exactly once regardless of how many notification branches
    // fire.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T12:00:00")) // post-10am so ALL branches fire
    mocks.userFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings)
      return Promise.resolve(
        sql.includes("COUNT(")
          ? [{ count: BigInt(1) }]
          : [{ id: 1, name: "Item1", qty_on_hand: 1, min_stock: 10 }],
      )
    }) // low stock (sample + count)
    mocks.salesInvoiceCount.mockResolvedValue(1)
    mocks.salesInvoiceFindMany.mockResolvedValue([{ grandTotal: 100, paidAmount: 0 }]) // overdue
    mocks.purchaseOrderCount.mockResolvedValue(1) // stale PO
    mocks.attendanceCount.mockResolvedValue(1)
    mocks.attendanceFindMany.mockResolvedValue([{ employeeId: 1, status: "late", lateMinutes: 1, employee: { name: "Late" } }]) // late
    mocks.holidayFindFirst.mockResolvedValue(null)
    mocks.employeeFindMany.mockResolvedValue([{ id: 99, name: "Absent", departmentId: null, workSchedules: [], department: null }])

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lowStock).toBe(1)
    expect(json.results.overdueInvoices).toBe(1)
    expect(json.results.stalePOs).toBe(1)
    expect(json.results.lateAttendance).toBe(1)
    expect(json.results.absentEmployees).toBe(1)

    // The pre-fetched admin IDs must be passed to every notifyUsers call
    expect(mocks.notifyUsersIfNew).toHaveBeenCalledTimes(5)
    for (const call of mocks.notifyUsersIfNew.mock.calls) {
      expect(call[0]).toEqual([1, 2])
    }

    // And the user table must have been queried exactly once
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
  })

  it("F-070-S: notifikasi pasangan menipis menyebut gudang (AC-MS-4)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.itemFindMany.mockResolvedValue([{ id: 1, name: "Busi", minStock: 5 }])
    mocks.itemWarehouseSettingFindMany.mockResolvedValue([])
    mocks.inventoryLayerFindMany.mockResolvedValue([
      { itemId: 1, warehouseId: 1, remaining: 100 },
      { itemId: 1, warehouseId: 2, remaining: 3 },
    ])
    mocks.warehouseFindMany.mockResolvedValue([
      { id: 1, name: "Gudang Pusat" },
      { id: 2, name: "Gudang Bengkel" },
    ])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.results.lowStockWarehouse).toBe(1)
    // Batch: satu panggilan berisi semua judul per gudang (bukan loop per baris).
    expect(mocks.notifyUsersIfNewBatch).toHaveBeenCalledTimes(1)
    const [userIds, entries, since] = mocks.notifyUsersIfNewBatch.mock.calls[0]
    expect(userIds).toEqual([1])
    expect(entries).toEqual([
      {
        title: "Stok Busi Menipis di Gudang Bengkel",
        body: expect.stringContaining("Stok di Gudang Bengkel: 3 (Minimum: 5)"),
        type: "warning",
      },
    ])
    expect(since).toBeInstanceOf(Date)
  })

  it("re-run same day skips duplicate notifications (idempotent cron)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T08:00:00"))
    mocks.notificationFindFirst.mockResolvedValue({ id: 42 })
    mocks.salesInvoiceCount.mockResolvedValue(1)
    mocks.salesInvoiceFindMany.mockResolvedValue([{ grandTotal: 100, paidAmount: 0 }])

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    // Route still delegates dedupe to service; service returns 0 rows.
    // Here notifyUsersIfNew is mocked, so assert route passes dayStart window.
    const call = mocks.notifyUsersIfNew.mock.calls.find((c) => String(c[1]).includes("Invoice Jatuh Tempo"))
    expect(call).toBeDefined()
    expect(call![4]).toBeInstanceOf(Date)
    expect((call![4] as Date).getHours()).toBe(0)
  })
})
