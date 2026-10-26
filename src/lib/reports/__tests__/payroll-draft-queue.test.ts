import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  PAYROLL_DRAFT_COLUMN_LABELS,
  PAYROLL_DRAFT_LEVEL_LABELS,
  PAYROLL_DRAFT_NOTICE_TEXT,
  PAYROLL_DRAFT_STALE_DAYS,
  buildPayrollDraftQueue,
  derivePayrollDraftAge,
  type PayrollDraftInput,
} from "../payroll-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  payrollFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: {
      findMany: (...a: unknown[]) => mocks.payrollFindMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mocks.userFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: (...a: unknown[]) => mocks.getHrScope(...a),
  hrScopeWhere: (scope: { kind: string; departmentId?: number | null; employeeId?: number }) => {
    if (scope.kind === "all") return {}
    if (scope.kind === "self") return { employeeId: scope.employeeId }
    if (scope.departmentId == null) return { employeeId: scope.employeeId }
    return { employee: { departmentId: scope.departmentId } }
  },
}))

import { getPayrollDraftQueue } from "../payroll-draft-queue-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<PayrollDraftInput> = {}): PayrollDraftInput {
  return {
    payrollId: 1,
    slug: "slip-1",
    documentNo: "PAY/2026/001",
    status: "draft",
    employeeId: 10,
    employeeName: "Karyawan Uji",
    period: "2026-10",
    type: "REGULAR",
    startDate: day(-14),
    endDate: day(-7),
    createdByName: "Pemroses Uji",
    createdAt: day(-2),
    ...overrides,
  }
}

describe("payroll-draft-queue (F-2026-10-26-070-S tahap 1)", () => {
  it("konstanta ambang + kata verbatim putusan Q-PDQ-1/2", () => {
    expect(PAYROLL_DRAFT_STALE_DAYS).toBe(3)
    expect(PAYROLL_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Proses",
    })
    expect(PAYROLL_DRAFT_COLUMN_LABELS).toEqual({
      period: "Periode",
      range: "Rentang",
      type: "Tipe",
      createdBy: "Dibuat Oleh",
      age: "Menunggu",
    })
    expect(PAYROLL_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya slip gaji yang masih draft. Slip draft belum disetujui dan belum dibayar; proses lewat detail slip. Nominal gaji tidak ditampilkan di daftar ini.",
    )
  })

  it("AC-PDQ-B1: approved/paid/status asing tidak masuk populasi", () => {
    const queue = buildPayrollDraftQueue(
      [
        input({ payrollId: 1, status: "approved", createdAt: day(-30) }),
        input({ payrollId: 2, status: "paid", createdAt: day(-30) }),
        input({ payrollId: 3, status: "asing-warisan", createdAt: day(-30) }),
        input({ payrollId: 4, createdAt: day(-30) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.payrollId)).toEqual([4])
    expect(queue.levelCounts).toEqual({ mengendap: 1, menunggu: 0 })
  })

  it("AC-PDQ-B3: batas umur — hari sama 0, tepat 3 mengendap, 2 menunggu", () => {
    expect(derivePayrollDraftAge(day(0), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: false,
    })
    const queue = buildPayrollDraftQueue(
      [
        input({ payrollId: 1, createdAt: day(-3) }),
        input({ payrollId: 2, createdAt: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows.find((r) => r.payrollId === 1)?.tingkat).toBe("mengendap")
    expect(queue.rows.find((r) => r.payrollId === 1)?.tingkatLabel).toBe("Mengendap")
    expect(queue.rows.find((r) => r.payrollId === 2)?.tingkat).toBe("menunggu")
    expect(queue.rows.find((r) => r.payrollId === 2)?.tingkatLabel).toBe("Menunggu Proses")
  })

  it("EC-PDQ-4: createdAt masa depan umur 0 tertanda, bukan negatif", () => {
    expect(derivePayrollDraftAge(day(3), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: true,
    })
  })

  it("urutan: mengendap dulu, lalu umur tertua; seri documentNo asc", () => {
    const queue = buildPayrollDraftQueue(
      [
        input({ payrollId: 1, documentNo: "PAY/B", createdAt: day(-1) }),
        input({ payrollId: 2, documentNo: "PAY/C", createdAt: day(-10) }),
        input({ payrollId: 3, documentNo: "PAY/A", createdAt: day(-20) }),
        input({ payrollId: 4, documentNo: "PAY/D", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.payrollId)).toEqual([3, 2, 4, 1])
  })

  it("AC-PDQ-B2/B4: payload tanpa field nominal; dua slip se-label beda rentang = dua baris; rekap = baris", () => {
    const queue = buildPayrollDraftQueue(
      [
        input({ payrollId: 1, period: "2026-10", startDate: day(-14), endDate: day(-7), createdAt: day(-9) }),
        input({ payrollId: 2, period: "2026-10", startDate: day(-7), endDate: day(0), createdAt: day(-1) }),
        input({ payrollId: 3, period: "2026-09", createdAt: day(-9) }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(3)
    for (const row of queue.rows) {
      const keys = Object.keys(row)
      for (const forbidden of [
        "baseSalary",
        "netSalary",
        "grossSalary",
        "totalAmount",
        "allowances",
        "deductions",
        "pph21",
        "bpjsHealthEmployee",
      ]) {
        expect(keys).not.toContain(forbidden)
      }
    }
    expect(queue.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
    expect(queue.totalDocuments).toBe(3)
    expect(queue.periodCounts).toEqual([
      { period: "2026-10", levelCounts: { mengendap: 1, menunggu: 1 }, total: 2 },
      { period: "2026-09", levelCounts: { mengendap: 1, menunggu: 0 }, total: 1 },
    ])
  })

  it("EC-PDQ-2: employeeId null tampil tanpa nama karangan, tetap terhitung", () => {
    const queue = buildPayrollDraftQueue(
      [input({ employeeId: null, employeeName: null, createdByName: null })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].employeeName).toBeNull()
    expect(queue.rows[0].createdByName).toBeNull()
  })
})

describe("getPayrollDraftQueue (loader fail-closed, AC-PDQ-B1/B4/B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["finance"] })
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.payrollFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([])
  })

  it("tanpa izin process_payroll loader menolak sebelum scope/query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getPayrollDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("process_payroll")
    expect(mocks.getHrScope).not.toHaveBeenCalled()
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })

  it("BR-PDQ-02: scope self jatuh kosong sebelum query (nol baris/nol rekap)", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 10 })
    const queue = await getPayrollDraftQueue({ now: NOW })
    expect(queue).toEqual({
      rows: [],
      levelCounts: { mengendap: 0, menunggu: 0 },
      periodCounts: [],
      totalDocuments: 0,
    })
    expect(mocks.payrollFindMany).not.toHaveBeenCalled()
  })

  it("scope all: query populasi persis status draft; select tanpa kolom nominal; nama pembuat massal 1 query", async () => {
    mocks.payrollFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "slip-1",
        documentNo: "PAY/2026/001",
        status: "draft",
        employeeId: 10,
        period: "2026-10",
        type: "REGULAR",
        startDate: day(-14),
        endDate: day(-7),
        createdBy: 99,
        createdAt: day(-10),
        employee: { name: "Karyawan Uji" },
      },
      {
        id: 2,
        slug: null,
        documentNo: "PAY/2026/002",
        status: "draft",
        employeeId: null,
        period: "2026-10",
        type: "REGULAR",
        startDate: day(-7),
        endDate: day(0),
        createdBy: 99,
        createdAt: day(-1),
        employee: null,
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 99, name: "Pemroses Uji" }])

    const queue = await getPayrollDraftQueue({ now: NOW })

    expect(mocks.payrollFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.payrollFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft" })
    const selectText = JSON.stringify(arg.select)
    for (const forbidden of ["baseSalary", "netSalary", "grossSalary", "totalAmount", "pph21"]) {
      expect(selectText).not.toContain(forbidden)
    }
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.userFindMany.mock.calls[0][0].where).toEqual({ id: { in: [99] } })

    expect(queue.totalDocuments).toBe(2)
    const old = queue.rows.find((r) => r.payrollId === 1)!
    expect(old.employeeName).toBe("Karyawan Uji")
    expect(old.createdByName).toBe("Pemroses Uji")
    expect(old.tingkat).toBe("mengendap")
    const orphan = queue.rows.find((r) => r.payrollId === 2)!
    expect(orphan.employeeName).toBeNull()
    expect(orphan.tingkat).toBe("menunggu")
  })

  it("scope department: where memuat saringan departemen lewat hrScopeWhere", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 5, employeeId: 7 })
    await getPayrollDraftQueue({ now: NOW })
    const arg = mocks.payrollFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", employee: { departmentId: 5 } })
  })
})
