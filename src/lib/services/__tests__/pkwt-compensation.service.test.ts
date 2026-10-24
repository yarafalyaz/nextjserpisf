import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-24-132-V E132-1..4 (vonis BOT 4): peristiwa terbekukan per
 * segmen, mapping fail-closed (600005/210204 dilarang), akrual agregat
 * satu jurnal per bulan + tutup persis, baris slip khusus non-parsial.
 */

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
const journalServiceMocks = vi.hoisted(() => ({
  createJournal: vi.fn().mockResolvedValue({ id: 55 }),
}))
vi.mock("@/lib/services/journal.service", () => ({
  JournalService: class {
    createJournal = journalServiceMocks.createJournal
  },
}))

import {
  createPkwtCompensationEvent,
  approvePkwtCompensationEvent,
  buildPkwtPayrollLineData,
  resolvePkwtMapping,
  runPkwtMonthlyAccrual,
} from "../pkwt-compensation.service"

const d = (s: string) => new Date(`${s}T00:00:00+07:00`)

const ACCOUNTS: Record<number, { code: string; isActive: boolean; deletedAt: null }> = {
  631: { code: "600028", isActive: true, deletedAt: null },
  231: { code: "210207", isActive: true, deletedAt: null },
  230: { code: "210204", isActive: true, deletedAt: null },
}

function baseClient(over: Record<string, unknown> = {}) {
  const client: Record<string, any> = {
    employee: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1, employmentStatus: "PKWT", baseSalary: 4_000_000, deletedAt: null,
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    employeePayrollComponent: {
      findMany: vi.fn().mockResolvedValue([{ defaultAmount: 1_000_000 }]),
    },
    pkwtCompensationEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 7, ...data })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 7, ...data })),
    },
    pkwtCompensationAccrual: {
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    payrollComponentLine: { findFirst: vi.fn().mockResolvedValue(null) },
    systemSetting: {
      findFirst: vi.fn().mockResolvedValue({
        pkwtCompensationExpenseAccountId: 631,
        pkwtCompensationPayableAccountId: 231,
      }),
    },
    account: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => ACCOUNTS[where.id] ?? null),
    },
    journal: { findFirst: vi.fn().mockResolvedValue(null) },
    ...over,
  }
  return client as any
}

beforeEach(() => vi.clearAllMocks())

describe("E132-1 peristiwa terbekukan", () => {
  it("snapshot: masa 5,5 bulan, basis pokok+tetap, nominal rumus umum", async () => {
    const client = baseClient()
    const ev = await createPkwtCompensationEvent(client, {
      employeeId: 1, segmentStart: d("2026-01-01"), segmentEnd: d("2026-06-15"),
    })
    expect(Number(ev.serviceMonths)).toBe(5.5)
    expect(Number(ev.basisMonthly)).toBe(5_000_000)
    expect(Number(ev.amount)).toBe(2_291_666.67)
    expect(ev.status).toBe("draft")
  })

  it("<1 bulan ditolak", async () => {
    const client = baseClient()
    await expect(
      createPkwtCompensationEvent(client, {
        employeeId: 1, segmentStart: d("2026-01-01"), segmentEnd: d("2026-01-20"),
      }),
    ).rejects.toThrow("kurang dari 1 bulan")
  })

  it("non-PKWT ditolak", async () => {
    const client = baseClient()
    client.employee.findUnique.mockResolvedValue({
      id: 1, employmentStatus: "PKWTT", baseSalary: 4_000_000, deletedAt: null,
    })
    await expect(
      createPkwtCompensationEvent(client, {
        employeeId: 1, segmentStart: d("2026-01-01"), segmentEnd: d("2026-12-31"),
      }),
    ).rejects.toThrow("hanya untuk PKWT")
  })

  it("segmen beririsan ditolak", async () => {
    const client = baseClient()
    client.pkwtCompensationEvent.findFirst.mockResolvedValue({ id: 3 })
    await expect(
      createPkwtCompensationEvent(client, {
        employeeId: 1, segmentStart: d("2026-01-01"), segmentEnd: d("2026-12-31"),
      }),
    ).rejects.toThrow("beririsan")
  })

  it("nominal kesepakatan mikro/kecil wajib dokumen tertulis", async () => {
    const client = baseClient()
    await expect(
      createPkwtCompensationEvent(client, {
        employeeId: 1, segmentStart: d("2026-01-01"), segmentEnd: d("2026-12-31"),
        agreementAmount: 1_000_000,
      }),
    ).rejects.toThrow("dokumen kesepakatan")
  })
})

describe("E132-2/4 mapping fail-closed + persetujuan", () => {
  it("mapping kosong: approve ditolak, kata wajib mapping", async () => {
    const client = baseClient()
    client.systemSetting.findFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: null, pkwtCompensationPayableAccountId: null,
    })
    client.pkwtCompensationEvent.findUnique.mockResolvedValue({ id: 7, status: "draft" })
    await expect(approvePkwtCompensationEvent(client, 7, 1)).rejects.toThrow("Mapping akun kompensasi PKWT belum lengkap")
  })

  it("akun terlarang 210204 di mapping: ditolak", async () => {
    const client = baseClient()
    client.systemSetting.findFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: 631, pkwtCompensationPayableAccountId: 230,
    })
    await expect(resolvePkwtMapping(client)).rejects.toThrow("dilarang untuk kompensasi PKWT")
  })
})

describe("E132-4 baris slip khusus", () => {
  const approvedEvent = {
    id: 7, employeeId: 1, amount: 2_500_000, status: "approved",
    segmentStart: d("2026-01-01"), basisMonthly: 5_000_000,
  }

  it("draft belum boleh ditarik; parsial ditolak", async () => {
    const client = baseClient()
    client.pkwtCompensationEvent.findUnique.mockResolvedValue({ ...approvedEvent, status: "draft" })
    await expect(buildPkwtPayrollLineData(client, { eventId: 7, payrollEmployeeId: 1 })).rejects.toThrow("belum disetujui")
    client.pkwtCompensationEvent.findUnique.mockResolvedValue(approvedEvent)
    await expect(
      buildPkwtPayrollLineData(client, { eventId: 7, payrollEmployeeId: 1, amount: 1_000_000 }),
    ).rejects.toThrow("Pembayaran parsial")
  })

  it("sudah terakrual: settledViaAccrual=true, snapshot akun 210207", async () => {
    const client = baseClient()
    client.pkwtCompensationEvent.findUnique.mockResolvedValue(approvedEvent)
    client.pkwtCompensationAccrual.aggregate.mockResolvedValue({ _sum: { amount: 2_000_000 } })
    const line = await buildPkwtPayrollLineData(client, { eventId: 7, payrollEmployeeId: 1 })
    expect(line.pkwtSettledViaAccrual).toBe(true)
    expect(line.accountIdSnapshot).toBe(231)
    expect(line.componentId).toBeNull()
  })

  it("belum terakrual: snapshot akun 600028; baris kedua ditolak", async () => {
    const client = baseClient()
    client.pkwtCompensationEvent.findUnique.mockResolvedValue(approvedEvent)
    const line = await buildPkwtPayrollLineData(client, { eventId: 7, payrollEmployeeId: 1 })
    expect(line.pkwtSettledViaAccrual).toBe(false)
    expect(line.accountIdSnapshot).toBe(631)
    client.payrollComponentLine.findFirst.mockResolvedValue({ id: 99 })
    await expect(buildPkwtPayrollLineData(client, { eventId: 7, payrollEmployeeId: 1 })).rejects.toThrow("sudah punya baris slip")
  })
})

describe("E132-2 akrual bulanan agregat", () => {
  it("satu jurnal agregat per bulan; bulan terakhir menutup ke nominal peristiwa", async () => {
    const journalCreate: any[] = []
    const accrualCreate: any[] = []
    const tx: any = {
      journal: { findFirst: vi.fn().mockResolvedValue(null) },
      pkwtCompensationAccrual: { create: vi.fn().mockImplementation(async (a: any) => { accrualCreate.push(a); return { id: 1 } }) },
    }
    const client = baseClient()
    client.employee.findMany.mockResolvedValue([
      { id: 1, contractStartDate: d("2026-01-01"), contractEndDate: d("2026-06-30") },
    ])
    client.pkwtCompensationEvent.findFirst
      .mockResolvedValue(null) // overlap check tidak dipakai di jalur akrual
    client.pkwtCompensationEvent.findFirst = vi.fn().mockResolvedValue({
      id: 7, amount: 2_500_000, basisMonthly: 5_000_000, segmentEnd: d("2026-06-30"),
    })
    client.pkwtCompensationAccrual.aggregate.mockResolvedValue({ _sum: { amount: 2_083_333.33 } })
    // tx client: service jalan langsung tanpa $transaction
    client.journal = tx.journal
    client.pkwtCompensationAccrual = {
      ...client.pkwtCompensationAccrual,
      create: tx.pkwtCompensationAccrual.create,
    }
    void journalCreate
    const res = await runPkwtMonthlyAccrual(client, "2026-06", 1)
    expect(journalServiceMocks.createJournal).toHaveBeenCalledTimes(1)
    const jArg = journalServiceMocks.createJournal.mock.calls[0][0]
    expect(jArg.entries[0].debit).toBe(416_666.67)
    expect(jArg.entries[1].credit).toBe(416_666.67)
    expect(res.accruedCount).toBe(1)
    expect(res.totalAmount).toBe(416_666.67) // tutup: 2.500.000 − 2.083.333,33
    expect(accrualCreate).toHaveLength(1)
    expect(Number(accrualCreate[0].data.amount)).toBe(416_666.67)
  })

  it("anti-dobel: bulan sudah terakrual dilewati", async () => {
    const client = baseClient()
    client.employee.findMany.mockResolvedValue([
      { id: 1, contractStartDate: d("2026-01-01"), contractEndDate: d("2026-12-31") },
    ])
    client.pkwtCompensationAccrual.findFirst.mockResolvedValue({ id: 5 })
    const res = await runPkwtMonthlyAccrual(client, "2026-03", 1)
    expect(res.accruedCount).toBe(0)
    expect(res.journalId).toBeNull()
  })
})
