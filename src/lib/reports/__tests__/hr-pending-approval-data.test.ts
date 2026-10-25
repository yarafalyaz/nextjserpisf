import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-007-S loader — yang dijaga (AC-HP-B2/B6/B7):
 * - kedua query berstatus PERSIS `pending` + scope HR diteruskan apa
 *   adanya (hrScopeWhere): self/department membatasi di server,
 * - scope rusak (self employeeId -1, dari getHrScope fail-closed) tidak
 *   menghasilkan baris orang lain (query tetap employeeId -1),
 * - select TIDAK memuat calculatedValue/nominal gaji,
 * - pemetaan field verbatim: cuti type/start/end, lembur date/hours
 *   string, departemen null jujur, label proyek fakta,
 * - loader tidak memanggil mutasi Prisma apa pun (hanya findMany),
 * - builder dipanggil ulang: baris non-pending dari mock pun dibuang.
 */

const mocks = vi.hoisted(() => ({
  leaveFindMany: vi.fn(),
  overtimeFindMany: vi.fn(),
  loanFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    leaveRequest: { findMany: mocks.leaveFindMany },
    overtimeRequest: { findMany: mocks.overtimeFindMany },
    employeeLoan: { findMany: mocks.loanFindMany },
  },
}))

import { loadHrPendingApprovalQueue } from "../hr-pending-approval-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const TODAY = new Date("2026-10-25T05:00:00.000Z")

function leaveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "cuti-1",
    status: "pending",
    employeeId: 10,
    type: "annual",
    startDate: d("2026-10-26"),
    endDate: d("2026-10-28"),
    reason: "urusan keluarga",
    createdAt: d("2026-10-20"),
    employee: { name: "Budi", department: { name: "Bengkel" } },
    ...overrides,
  }
}

function overtimeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    slug: "lembur-2",
    status: "pending",
    employeeId: 11,
    date: d("2026-10-24"),
    hours: { toString: () => "2.50" },
    reason: null,
    createdAt: d("2026-10-24"),
    employee: { name: "Sari", department: null },
    project: { name: "Servis Avanza" },
    ...overrides,
  }
}

function loanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    slug: "pinjaman-3",
    status: "pending",
    employeeId: 12,
    loanDate: d("2026-10-24"),
    totalAmount: { toString: () => "5000000.00" },
    monthlyInstallment: { toString: () => "500000.00" },
    weeklyInstallment: null,
    notes: "modal usaha",
    createdAt: d("2026-10-22"),
    employee: { name: "Joko", department: { name: "Bengkel" } },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.leaveFindMany.mockResolvedValue([])
  mocks.overtimeFindMany.mockResolvedValue([])
  mocks.loanFindMany.mockResolvedValue([])
})

describe("loadHrPendingApprovalQueue — rantai loader F-007-S", () => {
  it("ketiga query status persis pending + scope all kosong (semua baris dalam wewenang)", async () => {
    await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } }),
    )
    expect(mocks.overtimeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } }),
    )
    expect(mocks.loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } }),
    )
  })

  it("AC-HP-B2: scope self meneruskan employeeId pemanggil ke where ketiga query", async () => {
    const scope: HrScope = { kind: "self", employeeId: 42 }
    await loadHrPendingApprovalQueue(scope, TODAY)
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending", employeeId: 42 } }),
    )
    expect(mocks.overtimeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending", employeeId: 42 } }),
    )
    expect(mocks.loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending", employeeId: 42 } }),
    )
  })

  it("AC-HP-B2: scope department meneruskan filter relasi employee.departmentId", async () => {
    const scope: HrScope = { kind: "department", departmentId: 3, employeeId: 9 }
    await loadHrPendingApprovalQueue(scope, TODAY)
    const deptWhere = { status: "pending", employee: { departmentId: 3 } }
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: deptWhere }),
    )
    expect(mocks.overtimeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: deptWhere }),
    )
    expect(mocks.loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: deptWhere }),
    )
  })

  it("AC-HP-B2: scope rusak (self -1 fail-closed) tetap employeeId -1 — nol baris orang lain", async () => {
    const broken: HrScope = { kind: "self", employeeId: -1 }
    mocks.leaveFindMany.mockImplementation(async (args: { where: { employeeId?: number } }) =>
      args.where.employeeId === -1 ? [] : [leaveRow()],
    )
    const rows = await loadHrPendingApprovalQueue(broken, TODAY)
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending", employeeId: -1 } }),
    )
    expect(rows).toEqual([])
  })

  it("AC-HP-B7: select lembur TIDAK memuat calculatedValue; select cuti tanpa nominal", async () => {
    await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    const otSelect = mocks.overtimeFindMany.mock.calls[0][0].select
    expect(otSelect).not.toHaveProperty("calculatedValue")
    expect(JSON.stringify(otSelect)).not.toContain("calculatedValue")
    expect(JSON.stringify(otSelect)).not.toContain("totalHours")
    const lvSelect = mocks.leaveFindMany.mock.calls[0][0].select
    expect(JSON.stringify(lvSelect)).not.toContain("calculatedValue")
    expect(JSON.stringify(lvSelect)).not.toContain("salary")
  })

  it("pemetaan verbatim: cuti type/tanggal/alasan, lembur jam string + proyek + departemen null", async () => {
    mocks.leaveFindMany.mockResolvedValue([leaveRow()])
    mocks.overtimeFindMany.mockResolvedValue([overtimeRow()])
    const rows = await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    const leave = rows.find((r) => r.kind === "leave")!
    expect(leave).toMatchObject({
      employeeName: "Budi",
      departmentName: "Bengkel",
      leaveType: "annual",
      reason: "urusan keluarga",
      eventDate: d("2026-10-26"),
      endDate: d("2026-10-28"),
      penandaTanggal: "MENDEKATI_MULAI",
      umurMenungguHari: 5,
      tahapDasar: "MENGENDAP",
    })
    const ot = rows.find((r) => r.kind === "overtime")!
    expect(ot).toMatchObject({
      employeeName: "Sari",
      departmentName: null,
      hours: "2.50",
      projectName: "Servis Avanza",
      penandaTanggal: "TANGGAL_LEWAT_BELUM_DIPUTUS",
    })
    expect(ot).not.toHaveProperty("calculatedValue")
  })

  it("AC-LS-B5: pinjaman pending tampil dengan nominal penuh; pinjaman non-pending dibuang builder", async () => {
    mocks.loanFindMany.mockResolvedValue([
      loanRow(),
      loanRow({ id: 4, status: "active", employeeId: 13 }),
    ])
    const rows = await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    const loan = rows.find((r) => r.kind === "loan")!
    expect(loan).toMatchObject({
      employeeName: "Joko",
      departmentName: "Bengkel",
      loanTotalAmount: "5000000.00",
      loanMonthlyInstallment: "500000.00",
      loanWeeklyInstallment: null,
      reason: "modal usaha",
      eventDate: d("2026-10-24"),
      umurMenungguHari: 3,
    })
    expect(rows.filter((r) => r.kind === "loan")).toHaveLength(1)
  })

  it("AC-LS-B5: scope department pinjaman lain tidak bocor (where diteruskan ke query pinjaman)", async () => {
    const scope: HrScope = { kind: "department", departmentId: 9, employeeId: 5 }
    mocks.loanFindMany.mockImplementation(async (args: { where: { employee?: { departmentId?: number } } }) =>
      args.where.employee?.departmentId === 3 ? [loanRow()] : [],
    )
    const rows = await loadHrPendingApprovalQueue(scope, TODAY)
    expect(rows.filter((r) => r.kind === "loan")).toEqual([])
  })

  it("AC-LS-B5: select pinjaman tanpa nominal gaji; nominal pinjaman memang dimuat (Q-LS-3a)", async () => {
    await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    const select = mocks.loanFindMany.mock.calls[0][0].select
    expect(JSON.stringify(select)).not.toContain("salary")
    expect(JSON.stringify(select)).not.toContain("calculatedValue")
    expect(select).toMatchObject({
      totalAmount: true,
      monthlyInstallment: true,
      weeklyInstallment: true,
    })
  })

  it("AC-HP-B3/B6: baris non-pending dari query pun dibuang builder; loader tanpa mutasi", async () => {
    mocks.leaveFindMany.mockResolvedValue([leaveRow({ status: "approved" })])
    mocks.overtimeFindMany.mockResolvedValue([overtimeRow({ status: "approved" })])
    const rows = await loadHrPendingApprovalQueue({ kind: "all" }, TODAY)
    expect(rows).toEqual([])
  })
})
