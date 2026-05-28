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
}

// ==================== JOURNAL ACTIONS ====================

export async function createJournal(formData: FormData) {
  const user = await requirePermission("create_journals")

  const documentNo = await generateDocumentNumber("JRN")

  const journal = await prisma.journal.create({
    data: {
      journalNumber: documentNo,
      transactionDate: new Date(formData.get("transactionDate") as string),
      description: formData.get("description") as string | null,
      type: (formData.get("type") as string) || "GENERAL",
      status: "DRAFT",
      totalDebit: 0,
      totalCredit: 0,
      createdBy: Number(user.id),
    },
  })

  // Create journal entries with optional costCenterId
  const entriesJson = formData.get("entries") as string | null
  if (entriesJson) {
    const entries = safeJsonParse<{ accountId: number; debit: number; credit: number; memo: string; costCenterId?: number }[]>(entriesJson) ?? []
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
}

export async function postJournal(journalId: number) {
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
}

// ==================== EXPENSE ACTIONS ====================

export async function createExpense(formData: FormData) {
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
}

export async function approveExpense(expenseId: number) {
  const user = await requirePermission("edit_expenses")

  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (expense.status !== "pending") {
    throw new Error("Expense hanya bisa di-approve dari status pending")
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  // Accounting journal
  await onExpenseApproved(expenseId, Number(user.id))

  // Sync to PettyCash if paid from petty cash account
  await onExpenseApprovedSyncPettyCash(expenseId)

  revalidatePath("/keuangan/pengeluaran")
  revalidatePath("/keuangan/kas-kecil")
  return { success: true }
}

// ==================== PETTY CASH ACTIONS ====================

export async function createPettyCash(formData: FormData) {
  const user = await requirePermission("create_petty_cash")

  const documentNo = await generateDocumentNumber("PC")

  const type = formData.get("type") as string // IN or OUT
  const amount = requireNumber(formData.get("amount"), "amount")

  // Calculate balanceBefore from the last petty cash record
  const lastRecord = await prisma.pettyCash.findFirst({
    orderBy: { createdAt: "desc" },
  })
  const balanceBefore = lastRecord ? Number(lastRecord.balanceAfter) : 0
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
}

// ==================== BANK RECONCILIATION ACTIONS ====================

export async function createBankReconciliation(formData: FormData) {
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
}

export async function matchReconciliationLine(reconciliationId: number, lineId: number, journalEntryId: number) {
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
}

export async function completeReconciliation(reconciliationId: number) {
  await requirePermission("edit_journals")

  await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: { status: "completed" },
  })

  revalidatePath("/keuangan/rekonsiliasi-bank")
  return { success: true }
}

// ==================== BUDGET ACTIONS ====================

export async function createBudget(formData: FormData) {
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
}

// ==================== COST CENTER ACTIONS ====================

export async function createCostCenter(formData: FormData) {
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
}

export async function updateCostCenter(id: number, formData: FormData) {
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
}

// ==================== DELETE ACTIONS ====================

export async function deleteJournal(id: number) {
  await requirePermission("delete_journals")

  const journal = await prisma.journal.findUniqueOrThrow({ where: { id } })
  if (journal.status === "POSTED") {
    throw new Error("Tidak bisa menghapus journal yang sudah POSTED")
  }

  await prisma.journal.delete({ where: { id } })

  revalidatePath("/keuangan/jurnal")
  return { success: true }
}

export async function deleteExpense(id: number) {
  await requirePermission("delete_expenses")

  const expense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  if (expense.status === "approved") {
    throw new Error("Tidak bisa menghapus expense yang sudah approved")
  }

  await prisma.expense.delete({ where: { id } })

  revalidatePath("/keuangan/pengeluaran")
  return { success: true }
}

export async function deletePettyCash(id: number) {
  await requirePermission("delete_petty_cash")

  await prisma.pettyCash.delete({ where: { id } })

  revalidatePath("/keuangan/kas-kecil")
  return { success: true }
}

export async function deleteBudget(id: number) {
  await requirePermission("delete_budgets")

  await prisma.budget.delete({ where: { id } })

  revalidatePath("/keuangan/anggaran")
  return { success: true }
}

export async function deleteCostCenter(id: number) {
  await requirePermission("delete_cost_centers")

  await prisma.costCenter.delete({ where: { id } })

  revalidatePath("/keuangan/pusat-biaya")
  return { success: true }
}

export async function deleteStatisticalKeyFigure(id: number) {
  await requirePermission("delete_accounts")

  await prisma.statisticalKeyFigure.delete({ where: { id } })

  revalidatePath("/keuangan/angka-kunci-statistik")
  return { success: true }
}


export async function updateJournal(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_journals")

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
}

export async function updateExpense(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_expenses")

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
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_petty_cash")

  const type = formData.get("type") as string // IN or OUT
  const amount = requireNumber(formData.get("amount"), "amount")

  // Recalculate balance: find the record just before this one
  const currentRecord = await prisma.pettyCash.findUniqueOrThrow({ where: { id } })
  const balanceBefore = Number(currentRecord.balanceBefore)
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
}

export async function updateBudget(id: number, formData: FormData) {
  "use server"

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
}