"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { safeAdd, safeSubtract, compareAmounts } from "@/lib/utils/math"
import { prisma } from "@/lib/db/prisma"
import { onExpenseApproved, onPettyCashCreated } from "@/lib/hooks/accounting.hook"
import { onExpenseApprovedSyncPettyCash } from "@/lib/hooks/expense.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse , requireId, safeId, requireNumber} from "@/lib/utils/safe-parse"
import { parseFormData } from "@/lib/validations/parse-form"
import { bankStatementSchema, expenseSchema, pettyCashSchema, bankReconciliationSchema, budgetSchema, costCenterSchema } from "@/lib/validations/finance.schemas"
import { logActivity } from "@/lib/services/activity-log.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service"
import { computePettyCashChain, findFirstNegativeBalance } from "@/lib/finance/petty-cash-chain"

// ==================== BANK STATEMENT ACTIONS ====================

export async function createBankStatement(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const parsed = parseFormData(bankStatementSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const bankStatement = await prisma.bankStatement.create({
    data: {
      accountId: v.accountId,
      bankId: v.bankId ?? null,
      accountNumber: v.accountNumber ?? null,
      date: v.date,
      reference: v.reference ?? null,
      periodStart: v.periodStart ?? null,
      periodEnd: v.periodEnd ?? null,
      openingBalance: v.openingBalance,
      closingBalance: v.closingBalance,
      notes: v.notes ?? null,
      status: "draft",
      uploadedBy: Number(user.id),
    },
  })

  await logActivity("create", "BankStatement", bankStatement.id, "Membuat rekening koran bank")
  revalidatePath("/keuangan/laporan-bank")
  return { success: true, id: bankStatement.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBankStatement]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== JOURNAL ACTIONS ====================

export async function createJournal(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const documentNo = await generateDocumentNumber("JRN")

  // Block posting/creating into a closed accounting period
  const txDate = new Date(formData.get("transactionDate") as string)
  await assertPeriodOpen(txDate)

  // Laravel parity: parse and validate entries before creating journal
  const entriesJson = formData.get("entries") as string | null
  const entries = safeJsonParse<{ accountId: number; debit: number; credit: number; memo: string; costCenterId?: number }[]>(entriesJson) ?? []

  // Validate every entry has a valid accountId — reject early to prevent orphan header
  const validEntries = entries.filter(e => e.accountId && (e.debit > 0 || e.credit > 0))
  if (validEntries.length < 2) {
    throw new Error("Journal harus memiliki minimal 2 entri dengan akun dan nominal valid")
  }

  const totalDebit = validEntries.reduce((sum, e) => safeAdd(sum, e.debit || 0, 0), 0)
  const totalCredit = validEntries.reduce((sum, e) => safeAdd(sum, e.credit || 0, 0), 0)
  if (!compareAmounts(totalDebit, totalCredit, 0)) {
    throw new Error(`Journal tidak balance: Total Debit ${totalDebit} ≠ Total Credit ${totalCredit}`)
  }

  // Per-line validation: debit and credit must be non-negative and exclusive
  for (const entry of validEntries) {
    if ((entry.debit || 0) < 0 || (entry.credit || 0) < 0) {
      throw new Error("Nominal debit/credit tidak boleh negatif")
    }
    if ((entry.debit || 0) > 0 && (entry.credit || 0) > 0) {
      throw new Error("Satu baris tidak boleh memiliki debit dan credit sekaligus")
    }
  }

  // Wrap header + entries in a single transaction to prevent orphan journals
  const journal = await prisma.$transaction(async (tx) => {
    const j = await tx.journal.create({
      data: {
        journalNumber: documentNo,
        transactionDate: new Date(formData.get("transactionDate") as string),
        description: formData.get("description") as string | null,
        type: (formData.get("type") as string) || "GENERAL",
        status: "DRAFT",
        totalDebit,
        totalCredit,
        createdBy: Number(user.id),
      },
    })

    // Batch create all entries in one query (eliminates N+1)
    await tx.journalEntry.createMany({
      data: validEntries.map(entry => ({
        journalId: j.id,
        accountId: entry.accountId,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
        memo: entry.memo || null,
        costCenterId: entry.costCenterId || null,
      })),
    })

    return j
  })

  // Associate uploaded attachments with the new journal
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: journal.id },
      })
    }
  }

  await logActivity("create", "Journal", journal.id, "Membuat jurnal")
  revalidatePath("/keuangan/jurnal")
  return { success: true, id: journal.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createJournal]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function postJournal(journalId: number) {
  try {
  await requirePermission("edit_journals")

  const journal = await prisma.journal.findUniqueOrThrow({
    where: { id: journalId },
    include: { entries: true },
  })

  if (journal.status !== "DRAFT") {
    throw new Error("Journal hanya bisa di-post dari status DRAFT")
  }

  // Block posting into a closed accounting period
  await assertPeriodOpen(journal.transactionDate)

  // Validate double-entry balance
  const totalDebit = journal.entries.reduce((sum, e) => safeAdd(sum, Number(e.debit), 0), 0)
  const totalCredit = journal.entries.reduce((sum, e) => safeAdd(sum, Number(e.credit), 0), 0)

  if (!compareAmounts(totalDebit, totalCredit, 0)) {
    throw new Error(`Journal tidak balance: Debit ${totalDebit} vs Credit ${totalCredit}`)
  }

  await prisma.journal.update({
    where: { id: journalId },
    data: {
      status: "POSTED",
      totalDebit,
      totalCredit,
    },
  })

  await logActivity("post", "Journal", journalId, "Posting jurnal")
  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[postJournal]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== EXPENSE ACTIONS ====================

export async function createExpense(formData: FormData) {
  try {
  const user = await requirePermission("create_expenses")

  const parsed = parseFormData(expenseSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("EXP")

  const expense = await prisma.expense.create({
    data: {
      documentNo,
      employeeId: v.employeeId ?? null,
      accountId: v.accountId,
      paidFromAccountId: v.paidFromAccountId ?? null,
      projectId: v.projectId ?? null,
      costCenterId: v.costCenterId ?? null,
      amount: v.amount,
      date: v.date,
      referenceNo: v.referenceNo ?? null,
      description: v.description ?? null,
      category: v.category ?? null,
      receiptImage: v.receiptImage ?? null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new expense
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: expense.id },
      })
    }
  }

  await logActivity("create", "Expense", expense.id, "Membuat pengeluaran")
  // Route through approval workflow if one is configured for Expense.
  await requestApprovalIfConfigured("Expense", expense.id, Number(user.id))
  revalidatePath("/keuangan/pengeluaran")
  return { success: true, id: expense.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createExpense]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approveExpense(expenseId: number) {
  try {
  const user = await requirePermission("edit_expenses")

  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (expense.status !== "draft") {
    throw new Error("Expense hanya bisa di-approve dari status draft")
  }

  // Workflow approval must be complete (no-op if no workflow configured).
  await assertApproved("Expense", expenseId)

  // Sync to PettyCash FIRST (idempotent on documentNo), THEN flip to approved.
  // Ordering matters: if the petty-cash sync fails, the expense stays in
  // "draft" and the whole approveExpense is retryable. The previous order
  // (approve → sync) committed the approved status first, so a sync failure
  // left the expense permanently approved-but-unsynced (petty cash
  // under-recorded with no retry path, since approveExpense rejects non-draft).
  // The hook re-checks documentNo inside its own transaction, so a retry after
  // a partial failure will not double-create the petty cash record.
  await onExpenseApprovedSyncPettyCash(expenseId, Number(user.id))

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  await logActivity("approve", "Expense", expenseId, "Menyetujui pengeluaran")
  revalidatePath("/keuangan/pengeluaran")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approveExpense]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function markExpensePaid(expenseId: number) {
  try {
  await requirePermission("edit_expenses")

  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  // Laravel parity: only approved expenses can be marked as paid (draft → approved → paid)
  if (expense.status !== "approved") {
    throw new Error("Hanya pengeluaran yang sudah disetujui yang dapat ditandai sebagai dibayar")
  }

  // Post the accounting journal FIRST (Laravel parity: GL created when paid).
  // Posting before the status flip means a journal failure (e.g. closed period)
  // leaves the expense at "approved" and retryable, instead of stranding it as
  // "paid" with no GL entry. The journal's (referenceType, referenceId) unique
  // constraint already prevents any double-post on concurrent calls.
  await onExpenseApproved(expenseId)

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "paid" },
  })

  await logActivity("mark", "Expense", expenseId, "Menandai pengeluaran sebagai dibayar")
  revalidatePath("/keuangan/pengeluaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[markExpensePaid]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PETTY CASH ACTIONS ====================

type PettyCashTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Recompute the petty-cash running balance chain (balanceBefore/balanceAfter)
 * for every record in chronological order. Call inside a transaction after any
 * insert/update/delete that changes amounts so subsequent balances stay correct.
 *
 * When `guardNegative` is true, throws if any recomputed balanceAfter would be
 * negative. This is the order-aware overdraw guard: it catches backdated OUT
 * entries inserted mid-chain (which the per-record pre-check at insert time
 * cannot see) and edits that push a later balance below zero.
 */
async function recalcPettyCashChain(
  tx: PettyCashTx,
  opts?: { guardNegative?: boolean }
): Promise<void> {
  const all = await tx.pettyCash.findMany({
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { id: true, documentNo: true, type: true, amount: true, balanceBefore: true, balanceAfter: true },
  })
  const records = all.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
    type: r.type,
    amount: Number(r.amount),
  }))

  // Order-aware overdraw guard: catches backdated OUT entries inserted mid-chain
  // and edits that push a later balance below zero (the insert-time pre-check
  // only sees the tail balance, not the post-reorder chain).
  if (opts?.guardNegative) {
    const negative = findFirstNegativeBalance(records)
    if (negative) {
      throw new Error(
        `Saldo kas kecil menjadi negatif pada transaksi ${negative.record.documentNo ?? `#${negative.record.id}`} ` +
          `(saldo: ${negative.balanceAfter.toLocaleString("id-ID")}). Periksa urutan tanggal dan jumlah pengeluaran.`
      )
    }
  }

  const balances = computePettyCashChain(records)
  const existing = new Map(all.map((r) => [r.id, r]))
  const updates = balances.map((b) => {
    const rec = existing.get(b.id)!
    if (Number(rec.balanceBefore) !== b.balanceBefore || Number(rec.balanceAfter) !== b.balanceAfter) {
      return tx.pettyCash.update({
        where: { id: b.id },
        data: { balanceBefore: b.balanceBefore, balanceAfter: b.balanceAfter },
      })
    }
    return null
  }).filter(Boolean) as Promise<unknown>[]
  
  if (updates.length > 0) {
    await Promise.all(updates)
  }
}

/** Remove the accounting journal (and its entries) tied to a petty-cash record. */
async function deletePettyCashJournal(tx: PettyCashTx, pettyCashId: number): Promise<void> {
  const journals = await tx.journal.findMany({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
    select: { id: true },
  })
  if (journals.length === 0) return
  const journalIds = journals.map((j) => j.id)
  await tx.journalEntry.deleteMany({ where: { journalId: { in: journalIds } } })
  await tx.journal.deleteMany({ where: { id: { in: journalIds } } })
}

export async function createPettyCash(formData: FormData) {
  try {
  const user = await requirePermission("create_petty_cash")

  const parsed = parseFormData(pettyCashSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("PC")

  const type = v.type
  const amount = v.amount

  // Calculate balanceBefore from the last petty cash record
  const lastRecord = await prisma.pettyCash.findFirst({
    orderBy: { createdAt: "desc" },
  })
  const balanceBefore = lastRecord ? Number(lastRecord.balanceAfter) : 0

  // Laravel parity: OUT can't exceed current balance
  if (type === "OUT" && amount > balanceBefore) {
    throw new Error(`Saldo kas kecil tidak cukup: tersedia ${balanceBefore}, dibutuhkan ${amount}`)
  }

  const balanceAfter = type === "IN" ? safeAdd(balanceBefore, amount, 0) : safeSubtract(balanceBefore, amount, 0)

  const pettyCash = await prisma.$transaction(async (tx) => {
    const created = await tx.pettyCash.create({
      data: {
        documentNo,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        date: v.date,
        accountId: v.accountId ?? null,
        description: v.description ?? null,
        createdBy: Number(user.id),
      },
    })
    // Keep the running-balance chain correct regardless of insertion order.
    await recalcPettyCashChain(tx, { guardNegative: true })
    return created
  })

  // Accounting journal
  await onPettyCashCreated(pettyCash.id, Number(user.id))

  // Associate uploaded attachments with the new petty cash record
  const attachmentIds = v.attachmentIds as string | undefined
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: pettyCash.id },
      })
    }
  }

  await logActivity("create", "PettyCash", pettyCash.id, "Membuat transaksi kas kecil")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true, id: pettyCash.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPettyCash]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== BANK RECONCILIATION ACTIONS ====================

export async function createBankReconciliation(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const parsed = parseFormData(bankReconciliationSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const reconciliationNumber = await generateDocumentNumber("REC")

  const reconciliation = await prisma.bankReconciliation.create({
    data: {
      reconciliationNumber,
      accountId: v.accountId,
      statementDate: v.statementDate,
      statementBalance: v.statementBalance,
      periodStart: v.periodStart ?? null,
      periodEnd: v.periodEnd ?? null,
      bookBalance: v.bookBalance,
      notes: v.notes ?? null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  await logActivity("create", "BankReconciliation", reconciliation.id, "Membuat rekonsiliasi bank")
  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true, id: reconciliation.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBankReconciliation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function matchReconciliationLine(reconciliationId: number, lineId: number, journalEntryId: number) {
  try {
  await requirePermission("edit_journals")

  // Only draft reconciliations may be matched.
  const recon = await prisma.bankReconciliation.findUniqueOrThrow({
    where: { id: reconciliationId },
    select: { status: true },
  })
  if (recon.status !== "draft") {
    throw new Error("Hanya rekonsiliasi dengan status draft yang dapat dicocokkan")
  }

  // Dedupe: a statement line already matched in this reconciliation is updated in
  // place instead of inserting a duplicate match row.
  const existing = await prisma.bankReconciliationItem.findFirst({
    where: { bankReconciliationId: reconciliationId, bankStatementLineId: lineId },
    select: { id: true },
  })
  if (existing) {
    await prisma.bankReconciliationItem.update({
      where: { id: existing.id },
      data: { journalEntryId, matched: true },
    })
  } else {
    await prisma.bankReconciliationItem.create({
      data: {
        bankReconciliationId: reconciliationId,
        bankStatementLineId: lineId,
        journalEntryId,
        matched: true,
      },
    })
  }

  await logActivity("match", "BankReconciliation", reconciliationId, "Mencocokkan baris rekonsiliasi bank")
  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[matchReconciliationLine]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function completeReconciliation(reconciliationId: number) {
  try {
  await requirePermission("edit_journals")

  // Laravel parity: only draft reconciliations can be completed
  const reconciliation = await prisma.bankReconciliation.findUniqueOrThrow({
    where: { id: reconciliationId },
    include: { items: true },
  })

  if (reconciliation.status !== "draft") {
    throw new Error("Hanya rekonsiliasi dengan status draft yang dapat diselesaikan")
  }

  // Laravel parity: all lines must be matched before completing
  const unmatchedItems = reconciliation.items.filter((item) => !item.matched)
  if (unmatchedItems.length > 0) {
    throw new Error(`${unmatchedItems.length} baris belum di-match. Semua baris harus di-match sebelum menyelesaikan rekonsiliasi.`)
  }

  await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  })

  await logActivity("complete", "BankReconciliation", reconciliationId, "Menyelesaikan rekonsiliasi bank")
  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeReconciliation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== BUDGET ACTIONS ====================

export async function createBudget(formData: FormData) {
  try {
  const user = await requirePermission("create_budgets")

  const parsed = parseFormData(budgetSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const budget = await prisma.budget.create({
    data: {
      name: v.name,
      accountId: v.accountId,
      costCenterId: v.costCenterId ?? null,
      amount: v.amount,
      startDate: v.startDate,
      endDate: v.endDate,
      createdBy: Number(user.id),
    },
  })

  await logActivity("create", "Budget", budget.id, "Membuat anggaran")
  revalidatePath("/keuangan/anggaran")
  return { success: true, id: budget.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBudget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== COST CENTER ACTIONS ====================

export async function createCostCenter(formData: FormData) {
  try {
  await requirePermission("create_cost_centers")

  const parsed = parseFormData(costCenterSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const costCenter = await prisma.costCenter.create({
    data: {
      code: v.code,
      name: v.name,
      description: v.description ?? null,
      isActive: v.isActive,
    },
  })

  await logActivity("create", "CostCenter", costCenter.id, "Membuat pusat biaya")
  revalidatePath("/keuangan/pusat-biaya")
  return { success: true, id: costCenter.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createCostCenter]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateCostCenter(id: number, formData: FormData) {
  try {
  await requirePermission("edit_cost_centers")

  const parsed = parseFormData(costCenterSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  await prisma.costCenter.update({
    where: { id },
    data: {
      code: v.code,
      name: v.name,
      description: v.description ?? null,
      isActive: v.isActive,
    },
  })

  await logActivity("update", "CostCenter", id, "Memperbarui pusat biaya")
  revalidatePath("/keuangan/pusat-biaya")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateCostCenter]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteJournal(id: number) {
  try {
  await requirePermission("delete_journals")

  const journal = await prisma.journal.findUniqueOrThrow({ where: { id } })
  if (journal.status === "POSTED") {
    throw new Error("Tidak bisa menghapus journal yang sudah POSTED")
  }

  // Laravel parity: cascade delete entries then journal
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { journalId: id } })
    await tx.transactionAttachment.deleteMany({ where: { referenceType: "Journal", referenceId: id } })
    await tx.journal.delete({ where: { id } })
  })

  await logActivity("delete", "Journal", id, "Menghapus jurnal")
  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteJournal]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteExpense(id: number) {
  try {
  await requirePermission("delete_expenses")

  const expense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  // Laravel parity: only draft/pending expenses can be deleted
  if (expense.status === "approved" || expense.status === "paid") {
    throw new Error("Tidak bisa menghapus expense yang sudah approved atau paid")
  }

  await prisma.transactionAttachment.deleteMany({ where: { referenceType: "Expense", referenceId: id } })
  await prisma.expense.delete({ where: { id } })

  await logActivity("delete", "Expense", id, "Menghapus pengeluaran")
  revalidatePath("/keuangan/pengeluaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteExpense]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePettyCash(id: number) {
  try {
  await requirePermission("delete_petty_cash")

  await prisma.$transaction(async (tx) => {
    // Remove the linked journal (avoid orphaned GL entries), delete the record,
    // then recompute the running balance for all remaining records.
    await deletePettyCashJournal(tx, id)
    await tx.transactionAttachment.deleteMany({ where: { referenceType: "PettyCash", referenceId: id } })
    await tx.pettyCash.delete({ where: { id } })
    await recalcPettyCashChain(tx, { guardNegative: true })
  })

  await logActivity("delete", "PettyCash", id, "Menghapus transaksi kas kecil")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePettyCash]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteBudget(id: number) {
  try {
  await requirePermission("delete_budgets")

  await prisma.budget.delete({ where: { id } })

  await logActivity("delete", "Budget", id, "Menghapus anggaran")
  revalidatePath("/keuangan/anggaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBudget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteCostCenter(id: number) {
  try {
  await requirePermission("delete_cost_centers")

  await prisma.costCenter.delete({ where: { id } })

  await logActivity("delete", "CostCenter", id, "Menghapus pusat biaya")
  revalidatePath("/keuangan/pusat-biaya")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteCostCenter]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteStatisticalKeyFigure(id: number) {
  try {
  await requirePermission("delete_accounts")

  await prisma.statisticalKeyFigure.delete({ where: { id } })

  await logActivity("delete", "StatisticalKeyFigure", id, "Menghapus angka kunci statistik")
  revalidatePath("/keuangan/angka-kunci-statistik")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteStatisticalKeyFigure]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateJournal(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_journals")

  // Laravel parity: only DRAFT journals can be edited
  const existing = await prisma.journal.findUniqueOrThrow({ where: { id } })
  if (existing.status !== "DRAFT") {
    throw new Error("Journal yang sudah diposting tidak dapat diubah")
  }

  // Block editing into a closed accounting period (both old and new dates)
  await assertPeriodOpen(existing.transactionDate)
  await assertPeriodOpen(new Date(formData.get("transactionDate") as string))

  // Parse and validate entries with the same rigor as createJournal —
  // previously the edit path ignored line entries entirely, so edited lines
  // were silently discarded and the balance invariant was never re-checked.
  const entriesJson = formData.get("entries") as string | null
  const entries = safeJsonParse<{ accountId: number; debit: number; credit: number; memo: string; costCenterId?: number }[]>(entriesJson) ?? []
  const validEntries = entries.filter(e => e.accountId && (e.debit > 0 || e.credit > 0))
  if (validEntries.length < 2) {
    throw new Error("Journal harus memiliki minimal 2 entri dengan akun dan nominal valid")
  }

  const totalDebit = validEntries.reduce((sum, e) => safeAdd(sum, e.debit || 0, 0), 0)
  const totalCredit = validEntries.reduce((sum, e) => safeAdd(sum, e.credit || 0, 0), 0)
  if (!compareAmounts(totalDebit, totalCredit, 0)) {
    throw new Error(`Journal tidak balance: Total Debit ${totalDebit} ≠ Total Credit ${totalCredit}`)
  }
  for (const entry of validEntries) {
    if ((entry.debit || 0) < 0 || (entry.credit || 0) < 0) {
      throw new Error("Nominal debit/credit tidak boleh negatif")
    }
    if ((entry.debit || 0) > 0 && (entry.credit || 0) > 0) {
      throw new Error("Satu baris tidak boleh memiliki debit dan credit sekaligus")
    }
  }

  // Fix #14: Jangan generate documentNo baru dan jangan reset totals ke 0
  // Replace header + entries atomically (delete old entries, recreate from form).
  const journal = await prisma.$transaction(async (tx) => {
    const j = await tx.journal.update({
      where: { id },
      data: {
        transactionDate: new Date(formData.get("transactionDate") as string),
        description: formData.get("description") as string | null,
        type: (formData.get("type") as string) || "GENERAL",
        totalDebit,
        totalCredit,
      },
    })

    await tx.journalEntry.deleteMany({ where: { journalId: id } })
    await tx.journalEntry.createMany({
      data: validEntries.map(entry => ({
        journalId: id,
        accountId: entry.accountId,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
        memo: entry.memo || null,
        costCenterId: entry.costCenterId || null,
      })),
    })

    return j
  })

  // Associate uploaded attachments
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: journal.id },
      })
    }
  }

  await logActivity("update", "Journal", journal.id, "Memperbarui jurnal")
  revalidatePath("/keuangan/jurnal")
  return { success: true, id: journal.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateJournal]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function reverseJournal(journalId: number) {
  try {
  const user = await requirePermission("edit_journals")

  const journal = await prisma.journal.findUniqueOrThrow({
    where: { id: journalId },
    include: { entries: true },
  })

  // Laravel parity: only posted journals can be reversed
  if (journal.status !== "POSTED") {
    throw new Error("Hanya journal yang sudah POSTED yang bisa di-reverse")
  }

  // Atomic conditional claim — serialize concurrent reverse requests so only one
  // reversal journal is created; duplicates get a clean error instead of
  // corrupting the GL with two reversals.
  const claim = await prisma.journal.updateMany({
    where: { id: journalId, status: "POSTED" },
    data: { status: "REVERSING" },
  })
  if (claim.count === 0) {
    const current = await prisma.journal.findUnique({
      where: { id: journalId },
      select: { status: true },
    })
    throw new Error(
      current?.status === "REVERSED"
        ? "Jurnal sudah pernah dibalik"
        : current
          ? `Jurnal tidak bisa dibalik (status: ${current.status})`
          : "Jurnal tidak ditemukan"
    )
  }

  // Cannot reverse a journal that belongs to a closed period
  await assertPeriodOpen(journal.transactionDate)

  const documentNo = await generateDocumentNumber("JRN-RV")

  try {
    await prisma.$transaction(async (tx) => {
    const reversalJournal = await tx.journal.create({
      data: {
        journalNumber: documentNo,
        transactionDate: new Date(),
        description: `Reversal of ${journal.journalNumber}: ${journal.description ?? ""}`,
        type: journal.type,
        status: "POSTED",
        referenceType: "Journal",
        referenceId: journal.id,
        totalDebit: journal.totalDebit,
        totalCredit: journal.totalCredit,
        createdBy: Number(user.id),
      },
    })

    // Batch create reversal entries (eliminates N+1)
    await tx.journalEntry.createMany({
      data: journal.entries.map(entry => ({
        journalId: reversalJournal.id,
        accountId: entry.accountId,
        debit: entry.credit,
        credit: entry.debit,
        memo: `Reversal: ${entry.memo ?? ""}`,
        costCenterId: entry.costCenterId,
        profitCenterId: entry.profitCenterId,
      })),
    })

    await tx.journal.update({
      where: { id: journalId },
      data: { status: "REVERSED" },
    })
    })
  } catch (e) {
    // Tx failed after the claim flipped status to REVERSING — roll back the
    // claim so the journal can be retried instead of being stuck in limbo.
    await prisma.journal.updateMany({
      where: { id: journalId, status: "REVERSING" },
      data: { status: "POSTED" },
    })
    throw e
  }

  await logActivity("reverse", "Journal", journalId, "Membalik jurnal")
  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[reverseJournal]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateExpense(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("edit_expenses")

  // Laravel parity: only draft expenses can be edited
  const existingExpense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  if (existingExpense.status !== "draft") {
    throw new Error("Hanya pengeluaran dengan status draft yang dapat diubah")
  }

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      employeeId: safeId(formData.get("employeeId")),
      accountId: requireId(formData.get("accountId"), "accountId"),
      paidFromAccountId: safeId(formData.get("paidFromAccountId")),
      projectId: safeId(formData.get("projectId")),
      costCenterId: safeId(formData.get("costCenterId")),
      amount: requireNumber(formData.get("amount"), "amount"),
      date: new Date(formData.get("date") as string),
      referenceNo: formData.get("referenceNo") as string | null,
      description: formData.get("description") as string | null,
      category: formData.get("category") as string | null,
      receiptImage: formData.get("receiptImage") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new expense
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: expense.id },
      })
    }
  }

  await logActivity("update", "Expense", expense.id, "Memperbarui pengeluaran")
  revalidatePath("/keuangan/pengeluaran")
  return { success: true, id: expense.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateExpense]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("edit_petty_cash")

  const type = formData.get("type") as string // IN or OUT
  const amount = requireNumber(formData.get("amount"), "amount")

  const pettyCash = await prisma.$transaction(async (tx) => {
    // Remove the stale journal so it can be rebuilt with the new amount/type
    // (the create-hook is idempotent and would otherwise skip the update).
    await deletePettyCashJournal(tx, id)

    const updated = await tx.pettyCash.update({
      where: { id },
      data: {
        type,
        amount,
        date: new Date(formData.get("date") as string),
        accountId: safeId(formData.get("accountId")),
        description: formData.get("description") as string | null,
      },
    })

    // Recompute running balances for the whole chain (this + subsequent records).
    await recalcPettyCashChain(tx, { guardNegative: true })
    return updated
  })

  // Rebuild the accounting journal to reflect the edited values.
  await onPettyCashCreated(pettyCash.id, Number(user.id))

  // Associate uploaded attachments with the new petty cash record
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: pettyCash.id },
      })
    }
  }

  await logActivity("update", "PettyCash", pettyCash.id, "Memperbarui transaksi kas kecil")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true, id: pettyCash.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePettyCash]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateBudget(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("create_budgets")

  const budget = await prisma.budget.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      accountId: requireId(formData.get("accountId"), "accountId"),
      costCenterId: safeId(formData.get("costCenterId")),
      amount: requireNumber(formData.get("amount"), "amount"),
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      createdBy: Number(user.id),
    },
  })

  await logActivity("update", "Budget", budget.id, "Memperbarui anggaran")
  revalidatePath("/keuangan/anggaran")
  return { success: true, id: budget.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateBudget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
