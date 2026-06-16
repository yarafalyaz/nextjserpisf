
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { computePettyCashChain, findFirstNegativeBalance } from "@/lib/finance/petty-cash-chain";

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
    //
    // Reuse the shared `computePettyCashChain` + `findFirstNegativeBalance`
    // helpers from @/lib/finance/petty-cash-chain (the same source of truth
    // used by recalcPettyCashChain in finance.actions.ts) so the chain math
    // is float-drift-safe (safeAdd/safeSubtract) and the overdraw error
    // message is byte-identical with the one the rest of the app emits.
    // Previously this loop hand-rolled raw `+`/`-` arithmetic, which could
    // round differently from the canonical path and silently desync the
    // balanceAfter values that other code paths depend on.
    const all = await tx.pettyCash.findMany({
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, documentNo: true, type: true, amount: true, balanceBefore: true, balanceAfter: true },
    });

    const records = all.map((r) => ({
      id: r.id,
      documentNo: r.documentNo,
      type: r.type,
      amount: Number(r.amount),
    }));

    const negative = findFirstNegativeBalance(records);
    if (negative) {
      throw new Error(
        `Saldo kas kecil menjadi negatif pada transaksi ${negative.record.documentNo ?? `#${negative.record.id}`} ` +
          `(saldo: ${negative.balanceAfter.toLocaleString("id-ID")}). Periksa urutan tanggal dan jumlah pengeluaran.`
      );
    }

    const balances = computePettyCashChain(records);
    const balanceById = new Map(balances.map((b) => [b.id, b]));
    const updates = all
      .map((r) => {
        const target = balanceById.get(r.id);
        if (!target) return null;
        if (Number(r.balanceBefore) === target.balanceBefore && Number(r.balanceAfter) === target.balanceAfter) {
          return null;
        }
        return tx.pettyCash.update({
          where: { id: r.id },
          data: { balanceBefore: target.balanceBefore, balanceAfter: target.balanceAfter },
        });
      })
      .filter((u) => u !== null);

    if (updates.length > 0) {
      // Parallelise the per-row updates — N sequential round-trips → 1
      // batched concurrent dispatch. Matches the Promise.all pattern used
      // in recalcPettyCashChain in finance.actions.ts.
      await Promise.all(updates);
    }
  });
}
