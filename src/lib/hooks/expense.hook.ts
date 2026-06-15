
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Expense Hook - Observer pattern replacement.
 * When expense is approved AND paid from petty cash account, auto-create PettyCash OUT record.
 */

export async function onExpenseApprovedSyncPettyCash(
  expenseId: number,
  approvedByUserId?: number
): Promise<void> {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });

  // Only sync if paid from a petty cash type account
  if (!expense.paidFromAccountId) return;

  const paidFromAccount = await prisma.account.findUnique({
    where: { id: expense.paidFromAccountId },
  });

  // AccountType enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  // Petty cash accounts are typically ASSET type with specific naming
  if (!paidFromAccount || (!paidFromAccount.name.toLowerCase().includes("petty cash") && !paidFromAccount.name.toLowerCase().includes("kas kecil"))) return;

  // Idempotency: check if PettyCash record already exists for this expense
  const existing = await prisma.pettyCash.findFirst({
    where: { referenceNo: expense.documentNo },
  });
  if (existing) return;

  const documentNo = await generateDocumentNumber("PC");

  await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction to avoid a duplicate under concurrency.
    const dup = await tx.pettyCash.findFirst({ where: { referenceNo: expense.documentNo }, select: { id: true } });
    if (dup) return;

    await tx.pettyCash.create({
      data: {
        documentNo,
        type: "OUT",
        amount: expense.amount,
        description: `Expense: ${expense.description ?? expense.documentNo}`,
        accountId: expense.paidFromAccountId!,
        date: expense.date ?? new Date(),
        transactionDate: expense.date ?? new Date(),
        referenceNo: expense.documentNo,
        balanceBefore: 0,
        balanceAfter: 0,
        createdBy: approvedByUserId ?? expense.approvedBy ?? null,
      },
    });

    // Validate the running-balance chain in chronological (date,id) order
    // BEFORE persisting any updates, mirroring the negative-balance guard
    // in `recalcPettyCashChain` (used by createPettyCash / updatePettyCash /
    // deletePettyCash). Petty cash must not go negative, so approving an
    // expense that overdraws the chain (e.g. a back-dated OUT after later
    // INs) must be rejected — otherwise the negative balance would be
    // silently saved by the recompute loop below, breaking the invariant
    // enforced everywhere else.
    // Batch updates to avoid N+1 sequential round-trips while still enforcing
    // the same negative-balance guard as recalcPettyCashChain in finance.actions.
    const all = await tx.pettyCash.findMany({ orderBy: [{ date: "asc" }, { id: "asc" }] });
    let running = 0;
    const updates: Promise<unknown>[] = [];
    for (const rec of all) {
      const before = running;
      const after = rec.type === "IN" ? before + Number(rec.amount) : before - Number(rec.amount);
      if (after < 0) {
        throw new Error(
          `Saldo kas kecil menjadi negatif pada transaksi ${rec.documentNo ?? `#${rec.id}`} ` +
            `(saldo: ${after.toLocaleString("id-ID")}). Periksa urutan tanggal dan jumlah pengeluaran.`
        );
      }
      if (Number(rec.balanceBefore) !== before || Number(rec.balanceAfter) !== after) {
        updates.push(tx.pettyCash.update({ where: { id: rec.id }, data: { balanceBefore: before, balanceAfter: after } }));
      }
      running = after;
    }
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  });
}
