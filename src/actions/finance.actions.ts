"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onExpenseApproved, onPettyCashCreated } from "@/lib/hooks/accounting.hook"
import { onExpenseApprovedSyncPettyCash } from "@/lib/hooks/expense.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse , requireId, safeId, requireNumber, safeNumber} from "@/lib/utils/safe-parse"

// ==================== BANK STATEMENT ACTIONS ====================

export async function createBankStatement(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const bankStatement = await prisma.bankStatement.create({
    data: {
      accountId: requireId(formData.get("accountId"), "accountId"),
      bankId: safeId(formData.get("bankId")),
      accountNumber: formData.get("accountNumber") as string | null,
      date: new Date(formData.get("date") as string),
      reference: formData.get("reference") as string | null,
      periodStart: formData.get("periodStart") ? new Date(formData.get("periodStart") as string) : null,
      periodEnd: formData.get("periodEnd") ? new Date(formData.get("periodEnd") as string) : null,
      openingBalance: safeNumber(formData.get("openingBalance")) ?? 0,
      closingBalance: safeNumber(formData.get("closingBalance")) ?? 0,
      notes: formData.get("notes") as string | null,
      status: "draft",
      uploadedBy: Number(user.id),
    },
  })

  revalidatePath("/keuangan/laporan-bank")
  return { success: true, id: bankStatement.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBankStatement]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== JOURNAL ACTIONS ====================

export async function createJournal(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const documentNo = await generateDocumentNumber("JRN")

  // Laravel parity: parse and validate entries before creating journal
  const entriesJson = formData.get("entries") as string | null
  const entries = safeJsonParse<{ accountId: number; debit: number; credit: number; memo: string; costCenterId?: number }[]>(entriesJson) ?? []

  if (entries.length < 2) {
    throw new Error("Journal harus memiliki minimal 2 entri")
  }

  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0)
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal tidak balance: Total Debit ${totalDebit} ≠ Total Credit ${totalCredit}`)
  }

  const journal = await prisma.journal.create({
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

  // Create journal entries with optional costCenterId
  for (const entry of entries) {
    if (entry.accountId) {
      await prisma.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: entry.accountId,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          memo: entry.memo || null,
          costCenterId: entry.costCenterId || null,
        },
      })
    }
  }

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

  revalidatePath("/keuangan/jurnal")
  return { success: true, id: journal.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createJournal]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  // Validate double-entry balance
  const totalDebit = journal.entries.reduce((sum, e) => sum + Number(e.debit), 0)
  const totalCredit = journal.entries.reduce((sum, e) => sum + Number(e.credit), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
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

  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[postJournal]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== EXPENSE ACTIONS ====================

export async function createExpense(formData: FormData) {
  try {
  const user = await requirePermission("create_expenses")

  const documentNo = await generateDocumentNumber("EXP")

  const expense = await prisma.expense.create({
    data: {
      documentNo,
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

  revalidatePath("/keuangan/pengeluaran")
  return { success: true, id: expense.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createExpense]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  // Sync to PettyCash if paid from petty cash account
  await onExpenseApprovedSyncPettyCash(expenseId)

  revalidatePath("/keuangan/pengeluaran")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[approveExpense]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "paid" },
  })

  // Accounting journal (Laravel parity: created when status becomes paid)
  await onExpenseApproved(expenseId)

  revalidatePath("/keuangan/pengeluaran")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[markExpensePaid]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== PETTY CASH ACTIONS ====================

export async function createPettyCash(formData: FormData) {
  try {
  const user = await requirePermission("create_petty_cash")

  const documentNo = await generateDocumentNumber("PC")

  const type = formData.get("type") as string // IN or OUT
  const amount = requireNumber(formData.get("amount"), "amount")

  // Calculate balanceBefore from the last petty cash record
  const lastRecord = await prisma.pettyCash.findFirst({
    orderBy: { createdAt: "desc" },
  })
  const balanceBefore = lastRecord ? Number(lastRecord.balanceAfter) : 0

  // Laravel parity: OUT can't exceed current balance
  if (type === "OUT" && amount > balanceBefore) {
    throw new Error(`Saldo kas kecil tidak cukup: tersedia ${balanceBefore}, dibutuhkan ${amount}`)
  }

  const balanceAfter = type === "IN" ? balanceBefore + amount : balanceBefore - amount

  const pettyCash = await prisma.pettyCash.create({
    data: {
      documentNo,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      date: new Date(formData.get("date") as string),
      accountId: safeId(formData.get("accountId")),
      description: formData.get("description") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Accounting journal
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

  revalidatePath("/keuangan/kas-kecil")
  return { success: true, id: pettyCash.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createPettyCash]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== BANK RECONCILIATION ACTIONS ====================

export async function createBankReconciliation(formData: FormData) {
  try {
  const user = await requirePermission("create_journals")

  const reconciliationNumber = await generateDocumentNumber("REC")

  const reconciliation = await prisma.bankReconciliation.create({
    data: {
      reconciliationNumber,
      accountId: requireId(formData.get("accountId"), "accountId"),
      statementDate: new Date(formData.get("statementDate") as string),
      statementBalance: requireNumber(formData.get("statementBalance"), "statementBalance"),
      periodStart: formData.get("periodStart") ? new Date(formData.get("periodStart") as string) : null,
      periodEnd: formData.get("periodEnd") ? new Date(formData.get("periodEnd") as string) : null,
      bookBalance: safeNumber(formData.get("bookBalance")) ?? 0,
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true, id: reconciliation.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBankReconciliation]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function matchReconciliationLine(reconciliationId: number, lineId: number, journalEntryId: number) {
  try {
  await requirePermission("edit_journals")

  await prisma.bankReconciliationItem.create({
    data: {
      bankReconciliationId: reconciliationId,
      bankStatementLineId: lineId,
      journalEntryId,
      matched: true,
    },
  })

  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[matchReconciliationLine]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[completeReconciliation]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== BUDGET ACTIONS ====================

export async function createBudget(formData: FormData) {
  try {
  const user = await requirePermission("create_budgets")

  const budget = await prisma.budget.create({
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

  revalidatePath("/keuangan/anggaran")
  return { success: true, id: budget.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBudget]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== COST CENTER ACTIONS ====================

export async function createCostCenter(formData: FormData) {
  try {
  await requirePermission("create_cost_centers")

  const costCenter = await prisma.costCenter.create({
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      isActive: formData.get("isActive") === "on",
    },
  })

  revalidatePath("/keuangan/pusat-biaya")
  return { success: true, id: costCenter.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createCostCenter]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateCostCenter(id: number, formData: FormData) {
  try {
  await requirePermission("edit_cost_centers")

  await prisma.costCenter.update({
    where: { id },
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      isActive: formData.get("isActive") === "on",
    },
  })

  revalidatePath("/keuangan/pusat-biaya")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateCostCenter]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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
    await tx.journal.delete({ where: { id } })
  })

  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteJournal]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  await prisma.expense.delete({ where: { id } })

  revalidatePath("/keuangan/pengeluaran")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteExpense]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deletePettyCash(id: number) {
  try {
  await requirePermission("delete_petty_cash")

  await prisma.pettyCash.delete({ where: { id } })

  revalidatePath("/keuangan/kas-kecil")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deletePettyCash]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteBudget(id: number) {
  try {
  await requirePermission("delete_budgets")

  await prisma.budget.delete({ where: { id } })

  revalidatePath("/keuangan/anggaran")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteBudget]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteCostCenter(id: number) {
  try {
  await requirePermission("delete_cost_centers")

  await prisma.costCenter.delete({ where: { id } })

  revalidatePath("/keuangan/pusat-biaya")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteCostCenter]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteStatisticalKeyFigure(id: number) {
  try {
  await requirePermission("delete_accounts")

  await prisma.statisticalKeyFigure.delete({ where: { id } })

  revalidatePath("/keuangan/angka-kunci-statistik")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteStatisticalKeyFigure]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  // Fix #14: Jangan generate documentNo baru dan jangan reset totals ke 0
  const journal = await prisma.journal.update({
    where: { id },
    data: {
      transactionDate: new Date(formData.get("transactionDate") as string),
      description: formData.get("description") as string | null,
      type: (formData.get("type") as string) || "GENERAL",
    },
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

  revalidatePath("/keuangan/jurnal")
  return { success: true, id: journal.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateJournal]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  const documentNo = await generateDocumentNumber("JRN-RV")

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

    for (const entry of journal.entries) {
      await tx.journalEntry.create({
        data: {
          journalId: reversalJournal.id,
          accountId: entry.accountId,
          debit: entry.credit,
          credit: entry.debit,
          memo: `Reversal: ${entry.memo ?? ""}`,
          costCenterId: entry.costCenterId,
          profitCenterId: entry.profitCenterId,
        },
      })
    }

    await tx.journal.update({
      where: { id: journalId },
      data: { status: "REVERSED" },
    })
  })

  revalidatePath("/keuangan/jurnal")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[reverseJournal]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateExpense(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("create_expenses")

  // Laravel parity: only draft expenses can be edited
  const existingExpense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  if (existingExpense.status !== "draft") {
    throw new Error("Hanya pengeluaran dengan status draft yang dapat diubah")
  }

  const documentNo = await generateDocumentNumber("EXP")

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      documentNo,
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

  revalidatePath("/keuangan/pengeluaran")
  return { success: true, id: expense.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateExpense]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("create_petty_cash")

  const type = formData.get("type") as string // IN or OUT
  const amount = requireNumber(formData.get("amount"), "amount")

  // Recalculate balance: find the record just before this one
  const currentRecord = await prisma.pettyCash.findUniqueOrThrow({ where: { id } })
  const balanceBefore = Number(currentRecord.balanceBefore)

  // Laravel parity: OUT can't exceed current balance
  if (type === "OUT" && amount > balanceBefore) {
    throw new Error(`Saldo kas kecil tidak cukup: tersedia ${balanceBefore}, dibutuhkan ${amount}`)
  }

  const balanceAfter = type === "IN" ? balanceBefore + amount : balanceBefore - amount

  const pettyCash = await prisma.pettyCash.update({
    where: { id },
    data: {
      type,
      amount,
      balanceBefore,
      balanceAfter,
      date: new Date(formData.get("date") as string),
      accountId: safeId(formData.get("accountId")),
      description: formData.get("description") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Accounting journal
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

  revalidatePath("/keuangan/kas-kecil")
  return { success: true, id: pettyCash.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updatePettyCash]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  revalidatePath("/keuangan/anggaran")
  return { success: true, id: budget.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateBudget]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}
