import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  bankLineReadFixture,
  bankStatementLineForm,
  buildFinanceGuardMocks,
  type FinanceGuardHolder,
  recordBankStatementLineOrder,
  resetFinanceGuardMocks,
  runUpdateLineScenario,
  seedReconItems,
} from "./finance-lock-fixtures"

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
// - create: header dikunci di dalam tx SEBELUM assertPeriodOpen (setting)
//   + create baris + recalc (R-15: samakan urutan update/delete).
// - update: urutan lock global baris -> header(s) -> setting ->
//   rekonsiliasi; bila baris pindah header, header LAMA + BARU dikunci
//   terurut dalam satu panggilan helper sebelum update + recalc kedua header.
// - delete: baris -> header -> setting -> rekonsiliasi, header sebelum
//   delete + recalc.
//
// Mock prisma penuh seperti finance-recon-match-guard.test.ts: transaksi
// memanggil cb dengan prismaMock yang sama, jadi $executeRaw (lock baris +
// lock rekonsiliasi) dan $queryRaw (lock header) berbagi satu rekaman
// urutan. Recorder juga membungkus assertPeriodOpenMock sebagai
// "period-assert". Falsifikasi: cabut lockBankStatementHeaders dari salah
// satu jalur -> tes urutan jalur itu merah ("lock-header" hilang / salah
// posisi); kembalikan urutan create lama (period-assert sebelum
// lock-header) -> tes create R-15 merah.

// vi.hoisted tidak bisa memanggil helper yang diimpor (TDZ impor), jadi
// mock Prisma dibuat async di dalam factory vi.mock lalu disimpan di sini.
const mocks: FinanceGuardHolder = vi.hoisted(() => ({ guards: null as any, models: ["bankStatement", "bankStatementLine", "bankReconciliation", "bankReconciliationItem"] }))
vi.mock("@/lib/db/prisma", () => {
  mocks.guards = buildFinanceGuardMocks(mocks.models)
  return { prisma: mocks.guards.prismaMock }
})
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.guards.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.guards.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.guards.logActivityMock,
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.guards.assertPeriodOpenMock(...a),
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

beforeEach(() => {
  vi.clearAllMocks()
  resetFinanceGuardMocks(mocks.guards)
})

describe("R-12 kunci header bank_statements sebelum recalc", () => {
  it("create R-15: header dikunci sebelum assertPeriodOpen (setting) + create baris + recalc", async () => {
    const { order, headerLockIds, headerLockSql } =
      recordBankStatementLineOrder(
        mocks.guards.prismaMock,
        mocks.guards.assertPeriodOpenMock,
      )

    const res = await createBankStatementLine(
      bankStatementLineForm({
        bankStatementId: 42,
        date: "2026-06-13",
        amount: "1000",
        type: "debit",
      }),
    )

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-header",
      "period-assert",
      "create-line",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[42]])
    expect(headerLockSql[0]).toContain("FROM bank_statements")
    expect(headerLockSql[0]).toContain("ORDER BY id")
    expect(headerLockSql[0]).toContain("FOR UPDATE")
  })

  it("update pindah header: baris -> header lama+baru terurut -> setting -> rekonsiliasi -> update -> recalc dua header", async () => {
    const { order, headerLockIds, res } = await runUpdateLineScenario(
      mocks.guards.prismaMock,
      updateBankStatementLine,
      bankLineReadFixture({ bankStatementId: 7 }),
      mocks.guards.assertPeriodOpenMock,
    )

    // Header baru (3) < header lama (7): helper wajib mengurutkan naik
    // dalam satu panggilan, bukan urutan lama-baru dari pemanggil.
    // Dua period-assert: tanggal lama + tanggal baru, keduanya sesudah header.
    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "period-assert",
      "period-assert",
      "lock-recon",
      "update-line",
      "recalc",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3, 7]])
  })

  it("update header sama: header dikunci sekali (dedupe) sesudah baris, sebelum setting + rekonsiliasi", async () => {
    const { order, headerLockIds, res } = await runUpdateLineScenario(
      mocks.guards.prismaMock,
      updateBankStatementLine,
      bankLineReadFixture(),
      mocks.guards.assertPeriodOpenMock,
    )

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "period-assert",
      "period-assert",
      "lock-recon",
      "update-line",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3]])
  })

  it("delete: baris -> header -> setting -> rekonsiliasi -> delete -> recalc", async () => {
    mocks.guards.prismaMock.bankStatementLine.findUnique.mockResolvedValue(
      bankLineReadFixture(),
    )
    seedReconItems(mocks.guards.prismaMock)
    const { order, headerLockIds } = recordBankStatementLineOrder(
      mocks.guards.prismaMock,
      mocks.guards.assertPeriodOpenMock,
    )

    const res = await deleteBankStatementLine(11)

    expect(res.success).toBe(true)
    expect(order).toEqual([
      "lock-line",
      "lock-header",
      "period-assert",
      "lock-recon",
      "delete-line",
      "recalc",
    ])
    expect(headerLockIds).toEqual([[3]])
  })
})
