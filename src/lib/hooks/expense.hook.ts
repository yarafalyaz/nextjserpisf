// @ts-nocheck
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Expense Hook - Observer pattern replacement.
 * When expense is approved AND paid from petty cash account, auto-create PettyCash OUT record.
 */

export async function onExpenseApprovedSyncPettyCash(
  expenseId: number
): Promise<void> {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });

  // Only sync if paid from a petty cash type account
  if (!expense.paidFromAccountId) return;

  const paidFromAccount = await prisma.account.findUnique({
    where: { id: expense.paidFromAccountId },
  });

  if (!paidFromAccount || paidFromAccount.type !== "PETTY_CASH") return;

  // Idempotency: check if PettyCash record already exists for this expense
  const existing = await prisma.pettyCash.findFirst({
    where: { referenceNo: expense.documentNo },
  });
  if (existing) return;

  const documentNo = await generateDocumentNumber("PC");

  await prisma.pettyCash.create({
    data: {
      documentNo,
      type: "OUT",
      amount: expense.amount,
      description: `Expense: ${expense.description ?? expense.documentNo}`,
      accountId: expense.paidFromAccountId,
      transactionDate: expense.expenseDate ?? new Date(),
      referenceNo: expense.documentNo,
      createdBy: expense.approvedBy ?? null,
    },
  });
}
