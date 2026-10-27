/**
 * Loader read-only antrean reimbursement disetujui belum dibayar
 * (F-2026-10-27-082-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (PUTUSAN LEAD Q-RBQ-3): izin
 * `create_employee_reimbursements` pola getMyReimbursementClaims,
 * lalu `getHrScope`/`hrScopeWhere` — self hanya klaim sendiri,
 * department se-departemen, all lintas pengaju; scope rusak
 * fail-closed employeeId -1. Nol key baru tahap 1.
 *
 * Anti-N+1 (BR-RBQ-10): satu query Expense populasi + satu query
 * Journal massal atas set id klaim (pola reimbursement.actions.ts)
 * untuk fakta J-RB1/J-RB2 aktif + tanggal J-RB1. BUKAN query per baris.
 * Select daftar TIDAK memuat receiptImage/referenceNo (BR-RBQ-07).
 *
 * Baca-saja mutlak (BR-RBQ-09): loader hanya findMany; tidak memanggil
 * approveExpense/markExpensePaid/rejectExpense/tulis status apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import {
  REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
  REIMBURSEMENT_PAYMENT_REFERENCE_TYPE,
} from "@/lib/hooks/accounting.hook"
import {
  buildReimbursementQueue,
  type ReimbursementQueue,
  type ReimbursementQueueClaimInput,
} from "@/lib/reports/reimbursement-queue"

export interface ReimbursementQueueOptions {
  now?: Date
}

const QUEUE_LIMIT = 200

export async function getReimbursementQueue(
  options: ReimbursementQueueOptions = {},
): Promise<ReimbursementQueue> {
  const user = await requirePermission("create_employee_reimbursements")
  const scope = await getHrScope(user)

  const claims = await prisma.expense.findMany({
    where: { isReimbursementClaim: true, ...hrScopeWhere(scope) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: QUEUE_LIMIT,
    select: {
      id: true,
      slug: true,
      documentNo: true,
      employeeId: true,
      amount: true,
      status: true,
      createdAt: true,
      employee: { select: { name: true } },
    },
  })

  const ids = claims.map((c) => c.id)
  const journals =
    ids.length > 0
      ? await prisma.journal.findMany({
          where: {
            referenceId: { in: ids },
            referenceType: {
              in: [REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE, REIMBURSEMENT_PAYMENT_REFERENCE_TYPE],
            },
            status: { not: "REVERSED" },
            deletedAt: null,
          },
          select: { referenceId: true, referenceType: true, transactionDate: true },
        })
      : []

  const paidIds = new Set<number>()
  const accrualDateById = new Map<number, Date>()
  for (const j of journals) {
    if (j.referenceId === null) continue
    if (j.referenceType === REIMBURSEMENT_PAYMENT_REFERENCE_TYPE) {
      paidIds.add(j.referenceId)
    } else if (j.referenceType === REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE) {
      const existing = accrualDateById.get(j.referenceId)
      if (!existing || j.transactionDate < existing) accrualDateById.set(j.referenceId, j.transactionDate)
    }
  }

  const inputs: ReimbursementQueueClaimInput[] = claims.map((c) => ({
    claimId: c.id,
    slug: c.slug,
    documentNo: c.documentNo,
    employeeId: c.employeeId,
    employeeName: c.employee?.name ?? null,
    amount: c.amount,
    status: c.status,
    hasAccrualJournal: accrualDateById.has(c.id),
    hasPaymentJournal: paidIds.has(c.id),
    accrualJournalDate: accrualDateById.get(c.id) ?? null,
    createdAt: c.createdAt,
  }))

  return buildReimbursementQueue(inputs, options.now ?? new Date())
}
