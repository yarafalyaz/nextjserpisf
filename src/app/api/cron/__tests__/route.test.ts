import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  cronLogCreate: vi.fn(),
  systemSettingFindFirst: vi.fn(),
  systemSettingUpdate: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  salesInvoiceAggregate: vi.fn(),
  attendanceFindMany: vi.fn(),
  activityLogDeleteMany: vi.fn(),
  journalUpdateMany: vi.fn(),
  idempotencyKeyDeleteMany: vi.fn(),
  notificationLowStock: vi.fn(),
  notificationNotifyAdmins: vi.fn(),
  notificationLateCheckIn: vi.fn(),
  notificationLateCheckInBatch: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    cronLog: { create: (...a: unknown[]) => mocks.cronLogCreate(...a) },
    systemSetting: {
      findFirst: (...a: unknown[]) => mocks.systemSettingFindFirst(...a),
      update: (...a: unknown[]) => mocks.systemSettingUpdate(...a),
    },
    salesInvoice: {
      findFirst: (...a: unknown[]) => mocks.salesInvoiceFindFirst(...a),
      findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a),
      aggregate: (...a: unknown[]) => mocks.salesInvoiceAggregate(...a),
    },
    attendance: { findMany: (...a: unknown[]) => mocks.attendanceFindMany(...a) },
    activityLog: { deleteMany: (...a: unknown[]) => mocks.activityLogDeleteMany(...a) },
    journal: { updateMany: (...a: unknown[]) => mocks.journalUpdateMany(...a) },
    idempotencyKey: { deleteMany: (...a: unknown[]) => mocks.idempotencyKeyDeleteMany(...a) },
  },
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    checkAndNotifyLowStockBatch: (...a: unknown[]) => mocks.notificationLowStock(...a),
    notifyAdmins: (...a: unknown[]) => mocks.notificationNotifyAdmins(...a),
    notifyLateCheckIn: (...a: unknown[]) => mocks.notificationLateCheckIn(...a),
    notifyLateCheckInBatch: (...a: unknown[]) => mocks.notificationLateCheckInBatch(...a),
  },
}))

// Spy on console.error so we don't pollute test output
vi.spyOn(console, "error").mockImplementation(() => {})

function makeCronRequest(url: string): Request {
  return new Request(url, {
    headers: { authorization: "Bearer test-secret" },
  })
}

describe("GET /api/cron", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret"
    mocks.cronLogCreate.mockResolvedValue({})
    mocks.systemSettingFindFirst.mockResolvedValue({ id: 1, periodLockDate: null })
    mocks.systemSettingUpdate.mockResolvedValue({})
    mocks.salesInvoiceFindFirst.mockResolvedValue(null)
    mocks.queryRaw.mockResolvedValue([])
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.salesInvoiceAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { grandTotal: 0, paidAmount: 0 } })
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.journalUpdateMany.mockResolvedValue({ count: 0 })
    mocks.idempotencyKeyDeleteMany.mockResolvedValue({ count: 0 })
    mocks.activityLogDeleteMany.mockResolvedValue({ count: 0 })
  })

  it("rejects request without valid auth", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(new Request("http://localhost/api/cron"))
    expect(res.status).toBe(401)
  })

  it("rejects request with wrong bearer token", async () => {
    const res = await GET(new Request("http://localhost/api/cron", {
      headers: { authorization: "Bearer wrong-token" },
    }))
    expect(res.status).toBe(401)
  })

  it("runs all tasks when no task param provided", async () => {
    const res = await GET(makeCronRequest("http://localhost/api/cron"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results["lock-period"]).toBeDefined()
    expect(json.results["low-stock"]).toBeDefined()
    expect(json.results["overdue-invoice"]).toBeDefined()
    expect(json.results["late-checkin"]).toBeDefined()
    expect(json.results["cleanup"]).toBeDefined()
  })

  it("runs only the specified task when task param valid", async () => {
    const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
    const json = await res.json()
    expect(json.results["cleanup"]).toBeDefined()
    expect(json.results["low-stock"]).toBeUndefined()
  })

  it("rejects an invalid task param without running any task", async () => {
    const res = await GET(makeCronRequest("http://localhost/api/cron?task=hacker"))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error.code).toBe("BAD_REQUEST")
    expect(mocks.cronLogCreate).not.toHaveBeenCalled()
  })

  it("handles POST the same as GET", async () => {
    const res = await POST(makeCronRequest("http://localhost/api/cron"))
    expect(res.status).toBe(200)
  })

  describe("lock-period task", () => {
    it("locks period when no transactions in next month", async () => {
      mocks.salesInvoiceFindFirst.mockResolvedValue(null)
      mocks.systemSettingFindFirst.mockResolvedValue({ id: 1, periodLockDate: null })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("success")
      expect(mocks.systemSettingUpdate).toHaveBeenCalled()
    })

    it("locks period even when transactions exist in the current month (the just-opened month is unrelated to the previous-period lock)", async () => {
      // The presence of sales invoices in the current (just-opened) month is the
      // NORMAL state on/after the 1st of the month and is unrelated to whether
      // the previous accounting period should be locked. A guard here would make
      // the auto-lock cron never run in production. See fix(cron): auto-lock period guard skipped lock in normal operation.
      mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 99 })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("success")
      expect(mocks.systemSettingUpdate).toHaveBeenCalled()
    })

    it("throws when systemSetting is missing", async () => {
      mocks.systemSettingFindFirst.mockResolvedValue(null)
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("error")
    })
  })

  describe("low-stock task", () => {
    it("returns 'all stock safe' when no low items", async () => {
      mocks.queryRaw.mockResolvedValue([])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=low-stock"))
      const json = await res.json()
      expect(json.results["low-stock"].message).toBe("Semua stok aman")
    })

    it("triggers notifications when low items found", async () => {
      mocks.queryRaw.mockResolvedValue([
        { id: 1, name: "Item A", sku: "A1", qty_on_hand: 2, min_stock: 10 },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=low-stock"))
      const json = await res.json()
      expect(json.results["low-stock"].message).toContain("1 item")
      expect(mocks.notificationLowStock).toHaveBeenCalled()
    })
  })

  describe("overdue-invoice task", () => {
    it("returns 'no overdue' when empty list", async () => {
      mocks.salesInvoiceFindMany.mockResolvedValue([])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=overdue-invoice"))
      const json = await res.json()
      expect(json.results["overdue-invoice"].message).toBe("Tidak ada invoice overdue")
    })

    it("notifies admins when overdue invoices exist", async () => {
      mocks.salesInvoiceAggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { grandTotal: 3000, paidAmount: 500 } })
      mocks.salesInvoiceFindMany.mockResolvedValue([
        { documentNo: "INV-1", customer: { name: "PT A" }, grandTotal: 1000, paidAmount: 0 },
        { documentNo: "INV-2", customer: { name: "PT B" }, grandTotal: 2000, paidAmount: 500 },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=overdue-invoice"))
      const json = await res.json()
      expect(json.results["overdue-invoice"].message).toContain("2 invoice")
      expect(mocks.notificationNotifyAdmins).toHaveBeenCalled()
    })

    it("truncates long list with 'and N more' suffix", async () => {
      mocks.salesInvoiceAggregate.mockResolvedValue({ _count: { _all: 10 }, _sum: { grandTotal: 1000, paidAmount: 0 } })
      const invs = Array.from({ length: 5 }, (_, i) => ({
        documentNo: `INV-${i}`,
        customer: { name: `PT ${i}` },
        grandTotal: 100,
        paidAmount: 0,
      }))
      mocks.salesInvoiceFindMany.mockResolvedValue(invs)
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=overdue-invoice"))
      const json = await res.json()
      expect(json.results["overdue-invoice"].status).toBe("success")
      // "dan N lainnya" suffix is in the admin notification body, not the return string
      const notifyBody = mocks.notificationNotifyAdmins.mock.calls[0][1]
      expect(notifyBody).toContain("lainnya")
    })

    it("reports all overdue invoices even though only five examples are fetched", async () => {
      mocks.salesInvoiceAggregate.mockResolvedValue({ _count: { _all: 23 }, _sum: { grandTotal: 23000, paidAmount: 3000 } })
      mocks.salesInvoiceFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({
        documentNo: `INV-${i + 1}`,
        customer: { name: `PT ${i + 1}` },
        grandTotal: 1000,
        paidAmount: 0,
      })))

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=overdue-invoice"))
      const json = await res.json()
      expect(json.results["overdue-invoice"].message).toContain("23 invoice")
      const notifyBody = mocks.notificationNotifyAdmins.mock.calls[0][1]
      expect(notifyBody).toContain("18 lainnya")
      expect(notifyBody).toContain("Rp 20.000")
    })

    it("handles invoice with null customer", async () => {
      mocks.salesInvoiceAggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { grandTotal: 100, paidAmount: 0 } })
      mocks.salesInvoiceFindMany.mockResolvedValue([
        { documentNo: "INV-1", customer: null, grandTotal: 100, paidAmount: 0 },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=overdue-invoice"))
      const json = await res.json()
      expect(json.results["overdue-invoice"].status).toBe("success")
    })
  })

  describe("late-checkin task", () => {
    it("returns 'no late checkin' when empty", async () => {
      mocks.attendanceFindMany.mockResolvedValue([])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=late-checkin"))
      const json = await res.json()
      expect(json.results["late-checkin"].message).toBe("Tidak ada keterlambatan check-in hari ini")
    })

    it("notifies per attendance row with valid employee", async () => {
      mocks.attendanceFindMany.mockResolvedValue([
        {
          checkIn: new Date(),
          employee: { id: 1, name: "John", department: { name: "IT" } },
        },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=late-checkin"))
      const json = await res.json()
      expect(json.results["late-checkin"].message).toContain("1 karyawan")
      expect(mocks.notificationLateCheckInBatch).toHaveBeenCalled()
      // Per-employee loop is gone: a single batched call handles all rows.
      expect(mocks.notificationLateCheckIn).not.toHaveBeenCalled()
    })

    it("skips rows with null employee", async () => {
      mocks.attendanceFindMany.mockResolvedValue([
        { checkIn: new Date(), employee: null },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=late-checkin"))
      const json = await res.json()
      expect(json.results["late-checkin"].status).toBe("success")
      // All employees were null → empty entries → batch helper not called.
      expect(mocks.notificationLateCheckInBatch).not.toHaveBeenCalled()
      expect(mocks.notificationLateCheckIn).not.toHaveBeenCalled()
    })

    it("handles attendance with null checkIn", async () => {
      mocks.attendanceFindMany.mockResolvedValue([
        { checkIn: null, employee: { id: 1, name: "John", department: null } },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=late-checkin"))
      const json = await res.json()
      expect(json.results["late-checkin"].status).toBe("success")
      expect(mocks.notificationLateCheckInBatch).toHaveBeenCalled()
    })

    it("batches multiple late employees into a single helper call", async () => {
      mocks.attendanceFindMany.mockResolvedValue([
        { checkIn: new Date(), employee: { id: 1, name: "Alice", department: { name: "IT" } } },
        { checkIn: new Date(), employee: { id: 2, name: "Bob",   department: { name: "HR" } } },
        { checkIn: new Date(), employee: { id: 3, name: "Carol", department: null } },
      ])
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=late-checkin"))
      const json = await res.json()
      expect(json.results["late-checkin"].message).toContain("3 karyawan")
      expect(mocks.notificationLateCheckInBatch).toHaveBeenCalledTimes(1)
      const entries = mocks.notificationLateCheckInBatch.mock.calls[0][0]
      expect(entries).toHaveLength(3)
      expect(entries.map((e: { employee: { id: number } }) => e.employee.id)).toEqual([1, 2, 3])
    })
  })

  describe("cleanup task", () => {
    it("deletes logs older than 90 days", async () => {
      mocks.activityLogDeleteMany.mockResolvedValue({ count: 5 })
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      const json = await res.json()
      expect(json.results["cleanup"].message).toContain("5 log activity")
    })
  })

  describe("error handling", () => {
    it("captures thrown errors per task", async () => {
      // Force low-stock to throw via invalid $queryRaw return that breaks .map
      mocks.queryRaw.mockRejectedValue(new Error("DB down"))
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=low-stock"))
      const json = await res.json()
      expect(json.results["low-stock"].status).toBe("error")
      expect(json.results["low-stock"].message).toBe("DB down")
    })

    it("non-Error throw is stringified", async () => {
      mocks.queryRaw.mockImplementation(() => {
        throw "weird string error"
      })
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=low-stock"))
      const json = await res.json()
      expect(json.results["low-stock"].status).toBe("error")
      expect(json.results["low-stock"].message).toBe("Unknown error")
    })
  })

  describe("cronLog", () => {
    it("writes a cronLog entry per task", async () => {
      await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      expect(mocks.cronLogCreate).toHaveBeenCalled()
    })

    it("continues when cronLog write fails", async () => {
      mocks.cronLogCreate.mockRejectedValue(new Error("log write fail"))
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      // Task itself still succeeds even if logging fails
      const json = await res.json()
      expect(json.results["cleanup"].status).toBe("success")
    })
  })

  describe("recover-stuck-reversals task", () => {
    it("returns only stale REVERSING journals to POSTED", async () => {
      mocks.journalUpdateMany.mockResolvedValue({ count: 3 })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=recover-stuck-reversals"))
      const json = await res.json()

      expect(json.results["recover-stuck-reversals"].status).toBe("success")
      expect(mocks.journalUpdateMany).toHaveBeenCalledTimes(1)

      const args = mocks.journalUpdateMany.mock.calls[0][0] as {
        where: { status: string; updatedAt: { lt: Date } }
        data: { status: string }
      }
      // Only the REVERSING claim, and only when it is older than the grace period:
      // a reversal that is genuinely in flight must not be released.
      expect(args.where.status).toBe("REVERSING")
      expect(args.where.updatedAt.lt).toBeInstanceOf(Date)
      expect(args.data.status).toBe("POSTED")

      const ageMs = Date.now() - args.where.updatedAt.lt.getTime()
      expect(ageMs).toBeGreaterThan(10 * 60 * 1000)
    })

    it("reports success when nothing is stuck", async () => {
      mocks.journalUpdateMany.mockResolvedValue({ count: 0 })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=recover-stuck-reversals"))
      const json = await res.json()

      expect(json.results["recover-stuck-reversals"].status).toBe("success")
      expect(json.results["recover-stuck-reversals"].message).toMatch(/Tidak ada jurnal tertahan/)
    })

    it("is part of the default task set", async () => {
      const res = await GET(makeCronRequest("http://localhost/api/cron"))
      const json = await res.json()
      expect(json.results["recover-stuck-reversals"]).toBeDefined()
    })
  })

  describe("cleanup task", () => {
    it("also prunes expired idempotency keys", async () => {
      mocks.activityLogDeleteMany.mockResolvedValue({ count: 5 })
      mocks.idempotencyKeyDeleteMany.mockResolvedValue({ count: 7 })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      const json = await res.json()

      expect(json.results["cleanup"].status).toBe("success")
      expect(json.results["cleanup"].message).toContain("5 log activity")
      expect(json.results["cleanup"].message).toContain("7 kunci idempotency")
      // Only rows past the TTL are touched.
      const args = mocks.idempotencyKeyDeleteMany.mock.calls[0][0] as {
        where: { createdAt: { lt: Date } }
      }
      expect(args.where.createdAt.lt).toBeInstanceOf(Date)
    })

    it("still succeeds when the idempotency prune fails", async () => {
      mocks.idempotencyKeyDeleteMany.mockRejectedValue(new Error("db down"))

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      const json = await res.json()
      expect(json.results["cleanup"].status).toBe("success")
    })
  })
})
