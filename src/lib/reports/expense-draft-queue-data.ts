/**
 * Loader baca-saja antrean pengeluaran draft menunggu persetujuan
 * (F-2026-10-27-107-S, 107-B+F).
 *
 * Fail-closed SEBELUM query (BR-EXQ-09, Q-EXQ-3): gerbang
 * `view_expenses` — key yang sama dengan halaman pengeluaran
 * existing, tanpa key baru — ditegakkan di sini sebelum query.
 *
 * Anti-N+1 (BR-EXQ-09): satu query Expense draft (kategori, vendor,
 * dan karyawan pengaju lewat relasi dalam query yang sama), SATU
 * query massal Approval untuk semua id draft pada populasi penuh
 * (rekap dihitung dari populasi penuh, BR-EXQ-10), dan SATU query
 * massal Project untuk id proyek terkait. Tidak ada query per baris.
 * Pemilihan Approval terbaru per dokumen dilakukan builder.
 *
 * Select daftar-putih (BR-EXQ-06): `receiptImage` dan `referenceNo`
 * tidak pernah dibaca ke payload antrean.
 *
 * Baca-saja mutlak (BR-EXQ-07): hanya findMany; tidak memanggil
 * approve/reject/delete/pay existing dan tidak menulis kolom apa pun.
 * Populasi/umur/tingkat/ember/rekap di builder murni
 * `expense-draft-queue.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildExpenseDraftQueue,
  type ExpenseDraftApprovalInput,
  type ExpenseDraftInput,
  type ExpenseDraftQueue,
} from "@/lib/reports/expense-draft-queue"

export interface ExpenseDraftQueueOptions {
  now?: Date
  limit?: number
}

export async function getExpenseDraftQueue(
  options: ExpenseDraftQueueOptions = {},
): Promise<ExpenseDraftQueue> {
  await requirePermission("view_expenses")

  const expenses = await prisma.expense.findMany({
    where: { status: "draft" },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      amount: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      isReimbursementClaim: true,
      employeeId: true,
      categoryId: true,
      vendorId: true,
      projectId: true,
      description: true,
      category: { select: { label: true } },
      vendor: { select: { name: true } },
      employee: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const expenseIds = expenses.map((expense) => expense.id)
  const approvals =
    expenseIds.length > 0
      ? await prisma.approval.findMany({
          where: { referenceType: "Expense", referenceId: { in: expenseIds } },
          select: { id: true, referenceId: true, status: true, createdAt: true },
        })
      : []

  const projectIds = [
    ...new Set(
      expenses
        .map((expense) => expense.projectId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const projects =
    projectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : []
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]))

  const approvalsByExpense = new Map<number, ExpenseDraftApprovalInput[]>()
  for (const approval of approvals) {
    const arr = approvalsByExpense.get(approval.referenceId) ?? []
    arr.push({
      approvalId: approval.id,
      status: approval.status,
      createdAt: approval.createdAt,
    })
    approvalsByExpense.set(approval.referenceId, arr)
  }

  const inputs: ExpenseDraftInput[] = expenses.map((expense) => ({
    expenseId: expense.id,
    slug: expense.slug,
    documentNo: expense.documentNo,
    status: expense.status,
    amount: Number(expense.amount),
    date: expense.date,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    isReimbursementClaim: expense.isReimbursementClaim,
    employeeId: expense.employeeId,
    employeeName: expense.employee?.name ?? null,
    categoryName: expense.category?.label ?? null,
    vendorName: expense.vendor?.name ?? null,
    projectName:
      expense.projectId !== null
        ? (projectNameById.get(expense.projectId) ?? null)
        : null,
    description: expense.description,
    approvals: approvalsByExpense.get(expense.id) ?? [],
  }))

  return buildExpenseDraftQueue(inputs, options.now ?? new Date(), options.limit)
}
