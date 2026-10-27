import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route"

// Cron auto-lock (R-09) mengunci baris setting FOR UPDATE lewat tx.$queryRaw,
// sama seperti period-close. SystemSetting findFirst/update non-tx tetap
// dipakai tugas lain lewat prisma global.
const mocks = vi.hoisted(() => {
  const order: string[] = []
  const txQueryRaw = vi.fn(async (_strings: unknown, ..._values: unknown[]) => {
    order.push("lock")
    return [{ id: 1, period_lock_date: null as Date | null }]
  })
  const txSystemSettingUpdate = vi.fn(async (..._a: unknown[]) => {
    order.push("update")
    return {}
  })
  type TxMock = {
    $queryRaw: (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<Array<{ id: number; period_lock_date: Date | null }>>
    systemSetting: { update: (...a: unknown[]) => Promise<unknown> }
  }
  const tx: TxMock = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => txQueryRaw(strings, ...values),
    systemSetting: { update: (...a: unknown[]) => txSystemSettingUpdate(...a) },
  }
  return {
    order,
    tx,
    txQueryRaw,
    txSystemSettingUpdate,
    $transaction: vi.fn(async (cb: (t: TxMock) => unknown) => cb(tx)),
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
    attachmentFindMany: vi.fn(),
    attachmentDeleteMany: vi.fn(),
    notificationLowStock: vi.fn(),
    notificationNotifyAdmins: vi.fn(),
    notificationLateCheckIn: vi.fn(),
    notificationLateCheckInBatch: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    $transaction: (cb: (t: typeof mocks.tx) => unknown) => mocks.$transaction(cb),
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
    transactionAttachment: {
      findMany: (...a: unknown[]) => mocks.attachmentFindMany(...a),
      deleteMany: (...a: unknown[]) => mocks.attachmentDeleteMany(...a),
    },
  },
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    checkAndNotifyLowStockBatch: (...a: unknown[]) => mocks.notificationLowStock(...a),
    checkAndNotifyWarehouseLowStockBatch: vi.fn(async () => 0),
    notifyAdmins: (...a: unknown[]) => mocks.notificationNotifyAdmins(...a),
    notifyLateCheckIn: (...a: unknown[]) => mocks.notificationLateCheckIn(...a),
    notifyLateCheckInBatch: (...a: unknown[]) => mocks.notificationLateCheckInBatch(...a),
  },
}))

// F-070-S: loader per gudang membaca model baru; default kosong = aman.
vi.mock("@/lib/reports/min-stock-warehouse-alert", () => ({
  loadWarehouseLowStock: vi.fn(async () => []),
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
    mocks.order.length = 0
    mocks.txQueryRaw.mockImplementation(async () => {
      mocks.order.push("lock")
      return [{ id: 1, period_lock_date: null as Date | null }]
    })
    mocks.txSystemSettingUpdate.mockImplementation(async (..._a: unknown[]) => {
      mocks.order.push("update")
      return {}
    })
    mocks.$transaction.mockImplementation(async (cb: (t: typeof mocks.tx) => unknown) => cb(mocks.tx))
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
    mocks.attachmentFindMany.mockResolvedValue([])
    mocks.attachmentDeleteMany.mockResolvedValue({ count: 0 })
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
    // R-09: auto-lock harus SATU $transaction: kunci baris system_settings
    // FOR UPDATE -> baca ulang -> monotonic guard -> update via tx.
    // Falsifikasi: kembalikan findFirst+update non-tx di route -> urutan &
    // panggilan tx di bawah merah.
    function expectLockBeforeTxUpdate() {
      expect(mocks.$transaction).toHaveBeenCalledTimes(1)
      expect(mocks.txQueryRaw).toHaveBeenCalledTimes(1)
      const strings = mocks.txQueryRaw.mock.calls[0][0] as unknown as string[]
      const sql = strings.join(" ")
      expect(sql).toContain("FROM system_settings")
      expect(sql).toContain("period_lock_date")
      expect(sql).toContain("ORDER BY id")
      expect(sql).toContain("LIMIT 1")
      expect(sql).toContain("FOR UPDATE")
      expect(mocks.order[0]).toBe("lock")
      // Baca lama di luar tx tidak boleh jadi dasar keputusan.
      expect(mocks.systemSettingFindFirst).not.toHaveBeenCalled()
      expect(mocks.systemSettingUpdate).not.toHaveBeenCalled()
    }

    it("locks period when no transactions in next month", async () => {
      mocks.salesInvoiceFindFirst.mockResolvedValue(null)

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("success")
      expectLockBeforeTxUpdate()
      expect(mocks.order[1]).toBe("update")
      expect(mocks.txSystemSettingUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { periodLockDate: expect.any(Date) },
      })
      expect(json.results["lock-period"].message).toContain("Period dikunci hingga")
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
      expect(mocks.txSystemSettingUpdate).toHaveBeenCalled()
    })

    it("monotonic guard dibaca ulang sesudah lock: kunci masa depan tidak dimundurkan", async () => {
      const futureLock = new Date("2999-12-31T23:59:59")
      mocks.txQueryRaw.mockImplementation(async () => {
        mocks.order.push("lock")
        return [{ id: 1, period_lock_date: futureLock }]
      })
      // Baca luar-tx sengaja beda: bila guard memakai ini, kunci akan mundur.
      mocks.systemSettingFindFirst.mockResolvedValue({ id: 1, periodLockDate: null })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("success")
      expect(json.results["lock-period"].message).toContain("auto-lock tidak memundurkan kunci")
      expect(mocks.txSystemSettingUpdate).not.toHaveBeenCalled()
      expect(mocks.systemSettingFindFirst).not.toHaveBeenCalled()
    })

    it("throws when systemSetting is missing", async () => {
      mocks.txQueryRaw.mockImplementation(async () => {
        mocks.order.push("lock")
        return []
      })
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=lock-period"))
      const json = await res.json()
      expect(json.results["lock-period"].status).toBe("error")
      expect(mocks.txSystemSettingUpdate).not.toHaveBeenCalled()
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
    it("prunes old activity logs within the retention window, sparing purge records", async () => {
      mocks.activityLogDeleteMany.mockResolvedValue({ count: 5 })
      const res = await GET(makeCronRequest("http://localhost/api/cron?task=cleanup"))
      const json = await res.json()
      expect(json.results["cleanup"].message).toContain("5 log activity")
      // Retention is well beyond the old 90 days, and the append-only "purge"
      // meta-audit rows must never be pruned.
      expect(json.results["cleanup"].message).toContain("730")
      const where = mocks.activityLogDeleteMany.mock.calls[0][0].where
      expect(where.action).toEqual({ not: "purge" })
      expect(where.createdAt.lt).toBeInstanceOf(Date)
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
      expect(json.results["low-stock"].message).toBe("Terjadi kesalahan")
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

  describe("sweep-orphan-attachments task", () => {
    it("hanya menyapu referenceId=0 yang lebih tua dari ambang, bukan unggahan baru", async () => {
      mocks.attachmentFindMany.mockResolvedValue([
        { id: 7, referenceType: "vendor_bill", fileUrl: "/api/attachments/vendor_bill/vendor_bill-0-x.pdf" },
      ])
      mocks.attachmentDeleteMany.mockResolvedValue({ count: 1 })

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=sweep-orphan-attachments"))
      const json = await res.json()

      expect(json.results["sweep-orphan-attachments"].status).toBe("success")
      const findArgs = mocks.attachmentFindMany.mock.calls[0][0] as {
        where: { referenceId: number; createdAt: { lt: Date } }
      }
      // Kunci anti-salah-sapu: hanya baris sementara (0) DAN kedaluwarsa.
      expect(findArgs.where.referenceId).toBe(0)
      expect(findArgs.where.createdAt.lt).toBeInstanceOf(Date)
      const ageMs = Date.now() - findArgs.where.createdAt.lt.getTime()
      expect(ageMs).toBeGreaterThan(20 * 60 * 60 * 1000)
      // Hapus memakai id yang sama + dikunci referenceId=0 (klaim balap tak ikut terhapus).
      const delArgs = mocks.attachmentDeleteMany.mock.calls[0][0] as {
        where: { id: { in: number[] }; referenceId: number }
      }
      expect(delArgs.where.id).toEqual({ in: [7] })
      expect(delArgs.where.referenceId).toBe(0)
    })

    it("reports success when nothing is orphaned", async () => {
      mocks.attachmentFindMany.mockResolvedValue([])

      const res = await GET(makeCronRequest("http://localhost/api/cron?task=sweep-orphan-attachments"))
      const json = await res.json()

      expect(json.results["sweep-orphan-attachments"].status).toBe("success")
      expect(json.results["sweep-orphan-attachments"].message).toMatch(/Tidak ada lampiran yatim/)
      expect(mocks.attachmentDeleteMany).not.toHaveBeenCalled()
    })

    it("is part of the default task set", async () => {
      const res = await GET(makeCronRequest("http://localhost/api/cron"))
      const json = await res.json()
      expect(json.results["sweep-orphan-attachments"]).toBeDefined()
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
