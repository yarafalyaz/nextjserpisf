import { describe, it, expect, vi, beforeEach } from "vitest"

// Guard R-12: total header rekening koran basi saat baris berbeda pada
// header sama ditulis bersamaan. recalcBankStatementTotals menghitung
// agregat lalu update header — tanpa kunci header, dua transaksi penulis
// baris berbeda bisa recalc bersamaan dan update terakhir menimpa dengan
// angka yang belum mencakup baris transaksi lain.
//
// Kontrak yang dijaga di sini:
// - Helper lockBankStatementHeaders mengunci bank_statements dengan
//   `SELECT id FROM bank_statements WHERE id IN (...) ORDER BY id FOR UPDATE`
//   (id terurut anti-deadlock, Prisma.join untuk daftar id).
// - create: header dikunci di dalam tx SEBELUM create baris + recalc.
// - update: urutan lock global baris -> header(s) -> rekonsiliasi; bila
//   baris pindah header, header LAMA + BARU dikunci terurut dalam satu
//   panggilan helper sebelum update + recalc kedua header.
// - delete: baris -> header -> rekonsiliasi, header sebelum delete + recalc.
//
// Mock prisma penuh seperti finance-recon-match-guard.test.ts: transaksi
// memanggil cb dengan prismaMock yang sama, jadi $executeRaw (lock baris +
// lock rekonsiliasi) dan $queryRaw (lock header) berbagi satu rekaman
// urutan. Falsifikasi: cabut lockBankStatementHeaders dari salah satu
// jalur -> tes urutan jalur itu merah ("lock-header" hilang / salah posisi).

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })
  const prismaMock: any = {
    bankStatement: buildModelMock(),
    bankStatementLine: buildModelMock(),
    bankReconciliation: buildModelMock(),
    bankReconciliationItem: buildModelMock(),
    $transaction: vi.fn(async (cb: any) =>
      typeof cb === "function" ? cb(prismaMock) : Promise.all(cb),
    ),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  return {
    requirePermissionMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "DOC-001"),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "s") }))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: vi.fn(),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn(),
  onPettyCashCreated: vi.fn(),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn(),
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(async () => ({})),
}))

import {
  createBankStatementLine,
  updateBankStatementLine,
  deleteBankStatementLine,
} from "../finance.actions"

function fdMap(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

// Rekam urutan lintas mock: lock baris / lock header / lock rekonsiliasi /
// tulis baris / recalc (aggregate + update header).
function recordOrder() {
  const order: string[] = []
  const headerLockIds: number[][] = []
  const headerLockSql: string[] = []

  const exec = mocks.prismaMock.$executeRaw
  exec.mockImplementation(async (strings: any) => {
    const sql = String(strings?.[0] ?? "")
    if (sql.includes("bank_statement_lines")) order.push("lock-line")
    else if (sql.includes("bank_reconciliations")) order.push("lock-recon")
    else order.push(`exec:${sql}`)
    return 0
  })

  mocks.prismaMock.$queryRaw.mockImplementation(
    async (strings: any, ...values: any[]) => {
      const sql = (strings as unknown as string[]).join("?")
      // Prisma.join([a, b]) tiba sebagai satu Sql dengan values [a, b];
      // ratakan agar daftar id yang dikunci bisa diperiksa persis.
      const flat = values.flatMap((v: any) =>
        v && Array.isArray(v.values) ? v.values : [v],
      )
      order.push("lock-header")
      headerLockSql.push(sql)
      headerLockIds.push(flat)
      return []
    },
  )

  const line = mocks.prismaMock.bankStatementLine
  const origCreate = line.create.getMockImplementation()
  line.create.mockImplementation(async (...a: any[]) => {
    order.push("create-line")
    return origCreate ? origCreate(...a) : { id: 1 }
  })
  const origUpdate = line.update.getMockImplementation()
  line.update.mockImplementation(async (...a: any[]) => {
    order.push("update-line")
    return origUpdate ? origUpdate(...a) : {}
  })
  const origDelete = line.delete.getMockImplementation()
  line.delete.mockImplementation(async (...a: any[]) => {
    order.push("delete-line")
    return origDelete ? origDelete(...a) : {}
  })
  const origAggregate = line.aggregate.getMockImplementation()
  line.aggregate.mockImplementation(async (...a: any[]) => {
    order.push("recalc")
    return origAggregate ? origAggregate(...a) : { _sum: {} }
  })

  return { order, headerLockIds, headerLockSql }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of Object.values(mocks.prismaMock) as any[]) {
    if (!m || typeof m !== "object" || !m.findFirst) continue
    m.findFirst.mockReset().mockResolvedValue(null)
    m.findUnique.mockReset().mockResolvedValue(null)
    m.findUniqueOrThrow.mockReset().mockResolvedValue(null)
    m.findMany.mockReset().mockResolvedValue([])
    m.create.mockReset().mockResolvedValue({ id: 1 })
    m.update.mockReset().mockResolvedValue({})
    m.delete.mockReset().mockResolvedValue({})
    m.aggregate.mockReset().mockResolvedValue({ _sum: {} })
  }
  mocks.prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (cb: any) =>
      typeof cb === "function" ? cb(mocks.prismaMock) : Promise.all(cb),
    )
  mocks.prismaMock.$executeRaw.mockReset().mockResolvedValue(0)
  mocks.prismaMock.$queryRaw.mockReset().mockResolvedValue([])
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.assertPeriodOpenMock.mockReset().mockResolvedValue({})
})

describe("R-12 kunci header bank_statements sebelum recalc", () => {
  it("create: header dikunci sebelum create baris + recalc", async () => {
    const { order, headerLockIds, headerLockSql } = recordOrder()

    const res = await createBankStatementLine(
      fdMap({ bankStatementId: 42, date: "2026-06-13", amount: "1000", type: "debit" }),
    )

    expect(res.success).toBe(true)
    expect(order).toEqual(["lock-header", "create-line", "recalc"])
    expect(headerLockIds).toEqual([[42]])
    expect(headerLockSql[0]).toContain("FROM bank_statements")
    expect(headerLockSql[0]).toContain("ORDER BY id")
    expect(headerLockSql[0]).toContain("FOR UPDATE")
  })

  it("update pindah header: baris -> header lama+baru terurut -> rekonsiliasi -> update -> recalc dua header", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 7,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    const { order, headerLockIds } = recordOrder()

    // Header baru (3) < header lama (7): helper wajib mengurutkan naik
    // dalam satu panggilan, bukan urutan lama-baru dari pemanggil.
    const res = await updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "lock-recon",
      "update-line",
      "recalc",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3, 7]])
  })

  it("update header sama: header dikunci sekali (dedupe) sesudah baris, sebelum rekonsiliasi", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    const { order, headerLockIds } = recordOrder()

    const res = await updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "lock-recon",
      "update-line",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3]])
  })

  it("delete: baris -> header -> rekonsiliasi -> delete -> recalc", async () => {
    mocks.prismaMock.bankStatementLine.findUnique.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    const { order, headerLockIds } = recordOrder()

    const res = await deleteBankStatementLine(11)

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "lock-recon",
      "delete-line",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3]])
  })
})
