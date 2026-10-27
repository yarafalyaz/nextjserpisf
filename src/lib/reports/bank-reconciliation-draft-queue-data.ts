/**
 * Loader read-only antrean rekonsiliasi bank draft mengendap
 * (F-2026-10-27-097-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (BR-RBK-06, Q-RBK-6): izin
 * `view_bank_reconciliation` ditegakkan di sini persis gerbang halaman
 * daftar existing; tanpa izin loader melempar sebelum query apa pun.
 * Tanpa key baru, tanpa pembatasan per-akun (Q-RBK-6).
 *
 * Populasi persis `status = "draft"` + `deletedAt: null` (BR-RBK-01);
 * builder menyaring ulang lapis kedua. Select TIDAK PERNAH memuat
 * `difference`/`outstandingDeposits`/`outstandingPayments`/
 * `adjustedBookBalance` — kolom tersimpan draft (default 0) dilarang
 * terbaca sebagai selisih/status seimbang (BR-RBK-05). Saldo payload
 * verbatim header, Decimal→Number di tepi sini.
 *
 * Anti-N+1 (BR-RBK-09): satu query populasi + satu query item massal
 * (diagregasi di memori per rekonsiliasi) + satu query akun massal —
 * BUKAN query per baris. Draft tanpa item tampil hitungan 0 (BR-RBK-10).
 *
 * Baca-saja mutlak (BR-RBK-07, AC-RBK-B5): hanya findMany; tidak
 * memanggil match/unmatch/penyesuaian/completeReconciliation.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildBankReconciliationDraftQueue,
  type BankReconciliationDraftInput,
  type BankReconciliationDraftQueue,
} from "@/lib/reports/bank-reconciliation-draft-queue"

export interface BankReconciliationDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getBankReconciliationDraftQueue(
  options: BankReconciliationDraftQueueOptions = {},
): Promise<BankReconciliationDraftQueue> {
  await requirePermission("view_bank_reconciliation")

  const reconciliations = await prisma.bankReconciliation.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      reconciliationNumber: true,
      status: true,
      deletedAt: true,
      accountId: true,
      statementDate: true,
      periodStart: true,
      periodEnd: true,
      statementBalance: true,
      bookBalance: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const ids = reconciliations.map((r) => r.id)
  const items =
    ids.length > 0
      ? await prisma.bankReconciliationItem.findMany({
          where: { bankReconciliationId: { in: ids } },
          select: {
            bankReconciliationId: true,
            bankStatementLineId: true,
            journalEntryId: true,
            matched: true,
          },
        })
      : []

  interface ItemCounts {
    total: number
    matching: number
    matched: number
    adjustment: number
  }
  const countsById = new Map<number, ItemCounts>()
  for (const item of items) {
    let counts = countsById.get(item.bankReconciliationId)
    if (!counts) {
      counts = { total: 0, matching: 0, matched: 0, adjustment: 0 }
      countsById.set(item.bankReconciliationId, counts)
    }
    counts.total += 1
    if (item.bankStatementLineId != null || item.journalEntryId != null) {
      counts.matching += 1
      if (item.matched) counts.matched += 1
    } else {
      counts.adjustment += 1
    }
  }

  const accountIds = [...new Set(reconciliations.map((r) => r.accountId))]
  const accounts =
    accountIds.length > 0
      ? await prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        })
      : []
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const inputs: BankReconciliationDraftInput[] = reconciliations.map((r) => {
    const counts = countsById.get(r.id) ?? { total: 0, matching: 0, matched: 0, adjustment: 0 }
    const account = accountById.get(r.accountId)
    return {
      reconciliationId: r.id,
      slug: r.slug,
      reconciliationNumber: r.reconciliationNumber,
      status: r.status,
      deletedAt: r.deletedAt,
      accountId: r.accountId,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? null,
      statementDate: r.statementDate,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      statementBalance: Number(r.statementBalance),
      bookBalance: Number(r.bookBalance),
      createdAt: r.createdAt,
      totalItemCount: counts.total,
      matchingItemCount: counts.matching,
      matchedItemCount: counts.matched,
      adjustmentItemCount: counts.adjustment,
    }
  })

  return buildBankReconciliationDraftQueue(inputs, options.now ?? new Date())
}
