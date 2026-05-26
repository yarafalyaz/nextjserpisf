"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onExpenseApproved, onPettyCashCreated } from "@/lib/hooks/accounting.hook"
import { onExpenseApprovedSyncPettyCash } from "@/lib/hooks/expense.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"

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

  // Associate uploaded attachments with the new journal
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: journal.id },
      })
    }
  }

  revalidatePath("/finance/journals")
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

  revalidatePath("/finance/journals")
  return { success: true }
}

// ==================== EXPENSE ACTIONS ====================

export async function createExpense(formData: FormData) {
  const user = await requirePermission("create_expenses")

  const documentNo = await generateDocumentNumber("EXP")

  const expense = await prisma.expense.create({
    data: {
      documentNo,
      employeeId: formData.get("employeeId") ? Number(formData.get("employeeId")) : null,
      accountId: Number(formData.get("accountId")),
      paidFromAccountId: formData.get("paidFromAccountId") ? Number(formData.get("paidFromAccountId")) : null,
      amount: Number(formData.get("amount")),
      date: new Date(formData.get("date") as string),
      description: formData.get("description") as string | null,
      category: formData.get("category") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new expense
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: expense.id },
      })
    }
  }

  revalidatePath("/finance/expenses")
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

  revalidatePath("/finance/expenses")
  revalidatePath("/finance/petty-cash")
  return { success: true }
}

// ==================== PETTY CASH ACTIONS ====================

export async function createPettyCash(formData: FormData) {
  const user = await requirePermission("create_petty_cash")

  const documentNo = await generateDocumentNumber("PC")

  const pettyCash = await prisma.pettyCash.create({
    data: {
      documentNo,
      type: formData.get("type") as string, // IN or OUT
      amount: Number(formData.get("amount")),
      date: new Date(formData.get("date") as string),
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      description: formData.get("description") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Accounting journal
  await onPettyCashCreated(pettyCash.id, Number(user.id))

  // Associate uploaded attachments with the new petty cash record
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: pettyCash.id },
      })
    }
  }

  revalidatePath("/finance/petty-cash")
  return { success: true, id: pettyCash.id }
}

// ==================== BANK RECONCILIATION ACTIONS ====================

export async function createBankReconciliation(formData: FormData) {
  const user = await requirePermission("create_journals")

  const reconciliation = await prisma.bankReconciliation.create({
    data: {
      accountId: Number(formData.get("accountId")),
      statementDate: new Date(formData.get("statementDate") as string),
      statementBalance: Number(formData.get("statementBalance")),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/finance/bank-reconciliation")
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

  revalidatePath("/finance/bank-reconciliation")
  return { success: true }
}

export async function completeReconciliation(reconciliationId: number) {
  await requirePermission("edit_journals")

  await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: { status: "completed" },
  })

  revalidatePath("/finance/bank-reconciliation")
  return { success: true }
}

// ==================== BUDGET ACTIONS ====================

export async function createBudget(formData: FormData) {
  const user = await requirePermission("create_budgets")

  const budget = await prisma.budget.create({
    data: {
      name: formData.get("name") as string,
      accountId: Number(formData.get("accountId")),
      costCenterId: formData.get("costCenterId") ? Number(formData.get("costCenterId")) : null,
      amount: Number(formData.get("amount")),
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/finance/budgets")
  return { success: true, id: budget.id }
}

// ==================== COST CENTER ACTIONS ====================

export async function createCostCenter(formData: FormData) {
  await requirePermission("create_cost_centers")

  const costCenter = await prisma.costCenter.create({
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/finance/cost-centers")
  return { success: true, id: costCenter.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteJournal(id: number) {
  await requirePermission("delete_journals")

  await prisma.journal.delete({ where: { id } })

  revalidatePath("/finance/journals")
  return { success: true }
}

export async function deleteExpense(id: number) {
  await requirePermission("delete_expenses")

  await prisma.expense.delete({ where: { id } })

  revalidatePath("/finance/expenses")
  return { success: true }
}

export async function deletePettyCash(id: number) {
  await requirePermission("delete_petty_cash")

  await prisma.pettyCash.delete({ where: { id } })

  revalidatePath("/finance/petty-cash")
  return { success: true }
}

export async function deleteBudget(id: number) {
  await requirePermission("delete_budgets")

  await prisma.budget.delete({ where: { id } })

  revalidatePath("/finance/budgets")
  return { success: true }
}

export async function deleteCostCenter(id: number) {
  await requirePermission("delete_cost_centers")

  await prisma.costCenter.delete({ where: { id } })

  revalidatePath("/finance/cost-centers")
  return { success: true }
}

export async function deleteStatisticalKeyFigure(id: number) {
  await requirePermission("delete_accounts")

  await prisma.statisticalKeyFigure.delete({ where: { id } })

  revalidatePath("/finance/statistical-key-figures")
  return { success: true }
}


export async function updateJournal(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_journals")

  const documentNo = await generateDocumentNumber("JRN")

  const journal = await prisma.journal.update({
    where: { id },
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

  // Associate uploaded attachments with the new journal
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: journal.id },
      })
    }
  }

  revalidatePath("/finance/journals")
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
      employeeId: formData.get("employeeId") ? Number(formData.get("employeeId")) : null,
      accountId: Number(formData.get("accountId")),
      paidFromAccountId: formData.get("paidFromAccountId") ? Number(formData.get("paidFromAccountId")) : null,
      amount: Number(formData.get("amount")),
      date: new Date(formData.get("date") as string),
      description: formData.get("description") as string | null,
      category: formData.get("category") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new expense
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: expense.id },
      })
    }
  }

  revalidatePath("/finance/expenses")
  return { success: true, id: expense.id }
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_petty_cash")

  const documentNo = await generateDocumentNumber("PC")

  const pettyCash = await prisma.pettyCash.update({
    where: { id },
    data: {
      documentNo,
      type: formData.get("type") as string, // IN or OUT
      amount: Number(formData.get("amount")),
      date: new Date(formData.get("date") as string),
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      description: formData.get("description") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Accounting journal
  await onPettyCashCreated(pettyCash.id, Number(user.id))

  // Associate uploaded attachments with the new petty cash record
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: pettyCash.id },
      })
    }
  }

  revalidatePath("/finance/petty-cash")
  return { success: true, id: pettyCash.id }
}

export async function updateBudget(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_budgets")

  const budget = await prisma.budget.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      accountId: Number(formData.get("accountId")),
      costCenterId: formData.get("costCenterId") ? Number(formData.get("costCenterId")) : null,
      amount: Number(formData.get("amount")),
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/finance/budgets")
  return { success: true, id: budget.id }
}