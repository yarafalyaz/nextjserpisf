"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { safeAdd, safeSubtract, compareAmounts, safeRound } from "@/lib/utils/math";
import { prisma } from "@/lib/db/prisma";
import { checkIdempotency } from "@/lib/utils/idempotency";
import {
  onExpenseApproved,
  onPettyCashCreated,
} from "@/lib/hooks/accounting.hook";
import { onExpenseApprovedSyncPettyCash } from "@/lib/hooks/expense.hook";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { revalidatePath } from "next/cache";
import { safeJsonParse } from "@/lib/utils/safe-parse";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  bankStatementSchema,
  bankStatementLineSchema,
  expenseSchema,
  pettyCashSchema,
  bankReconciliationSchema,
  costCenterSchema,
  profitCenterSchema,
} from "@/lib/validations/finance.schemas";
import { logActivity } from "@/lib/services/activity-log.service";
import { getSystemSettings } from "@/lib/utils/settings";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import {
  requestApprovalIfConfigured,
  assertApproved,
} from "@/lib/services/approval-workflow.service";
import {
  computePettyCashChain,
  findFirstNegativeBalance,
} from "@/lib/finance/petty-cash-chain";
import { attachPendingTransactionAttachments } from "@/lib/services/transaction-attachment.service";
import { nextSlug } from "@/lib/utils/slug-db";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

// ==================== BANK STATEMENT ACTIONS ====================

export async function createBankStatement(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    const parsed = parseFormData(bankStatementSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    await assertPeriodOpen(v.date);

    const bankStatement = await prisma.bankStatement.create({
      data: {
        accountId: v.accountId,
        bankId: v.bankId ?? null,
        accountNumber: v.accountNumber ?? null,
        date: v.date,
        reference: v.reference ?? null,
        slug: await nextSlug("bankStatement", v.reference),
        periodStart: v.periodStart ?? null,
        periodEnd: v.periodEnd ?? null,
        openingBalance: v.openingBalance,
        closingBalance: v.closingBalance,
        notes: v.notes ?? null,
        status: "draft",
        uploadedBy: Number(user.id),
      },
    });

    await logActivity(
      "create",
      "BankStatement",
      bankStatement.id,
      "Membuat rekening koran bank",
    );
    revalidatePath("/keuangan/laporan-bank");
    return { success: true, id: bankStatement.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBankStatement]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BANK STATEMENT LINE ACTIONS ====================

type BankStatementTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Hitung ulang `totalDebits`/`totalCredits` header dari SELURUH barisnya.
 *
 * Wajib dipanggil di dalam transaksi yang SAMA dengan penulisan/penghapusan
 * barisnya: nilai total dihitung dari agregat baris (nilai ABSOLUT, bukan
 * penambahan bertahap), jadi kolom itu konsisten secara konstruksi dan tidak
 * bisa menjadi angka basi yang "terlihat wajar" tetapi tidak cocok dengan
 * barisnya.
 */
async function recalcBankStatementTotals(
  tx: BankStatementTx,
  bankStatementId: number,
) {
  const totals = await tx.bankStatementLine.aggregate({
    where: { bankStatementId },
    _sum: { debit: true, credit: true },
  });

  await tx.bankStatement.update({
    where: { id: bankStatementId },
    data: {
      totalDebits: safeRound(totals._sum?.debit ?? 0, 2),
      totalCredits: safeRound(totals._sum?.credit ?? 0, 2),
    },
  });
}

/**
 * Izin baris rekening koran = izin header-nya (`create_journals`).
 *
 * Jangan mengarang izin baru di sini: `edit_bank_statements` /
 * `delete_bank_statements` tidak pernah di-seed dan tidak ada halaman ubah
 * rekening koran, sehingga memakainya berarti tak seorang pun bisa menulis baris.
 * Alasan yang sama sudah dicatat di `src/lib/auth/attachment-permission-maps.ts`
 * (kunci `bank_statement`).
 */
export async function createBankStatementLine(formData: FormData) {
  try {
    await requirePermission("create_journals");

    const parsed = parseFormData(bankStatementLineSchema, formData);
    if (!parsed.success)
      return { success: false as const, error: parsed.error };
    const v = parsed.data;
    const lineDate = wibDateToUtcMidnight(v.date);

    await assertPeriodOpen(lineDate);

    const line = await prisma.$transaction(async (tx) => {
      const created = await tx.bankStatementLine.create({
        data: {
          bankStatementId: v.bankStatementId,
          // Tengah malam UTC untuk hari kalender WIB — bukan `new Date(...)`
          // yang bergantung pada zona waktu proses.
          date: lineDate,
          description: v.description ?? null,
          // `type` memilih kolomnya dan `amount` selalu ikut terisi, supaya arah
          // mutasi bisa dibaca dari barisnya. Kedua kolom terisi sekaligus
          // membuat rekonsiliasi ambigu.
          amount: v.amount,
          debit: v.type === "debit" ? v.amount : 0,
          credit: v.type === "credit" ? v.amount : 0,
          type: v.type,
          reference: v.reference ?? null,
          status: "unmatched",
        },
      });
      await recalcBankStatementTotals(tx, v.bankStatementId);
      return created;
    });

    await logActivity(
      "create",
      "BankStatementLine",
      line.id,
      `Menambah baris rekening koran #${v.bankStatementId}`,
    );
    revalidatePath("/keuangan/laporan-bank");
    return { success: true as const, id: line.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBankStatementLine]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateBankStatementLine(id: number, formData: FormData) {
  try {
    await requirePermission("create_journals");

    const parsed = parseFormData(bankStatementLineSchema, formData);
    if (!parsed.success)
      return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.$transaction(async (tx) => {
      // Baris lama dibaca lebih dulu: baris yang tidak ada harus GAGAL (bukan
      // "sukses" palsu), dan bila barisnya berpindah rekening koran, header
      // LAMA juga wajib dihitung ulang — kalau tidak totalnya tertinggal.
      const existing = await tx.bankStatementLine.findUniqueOrThrow({
        where: { id },
        select: { bankStatementId: true, date: true },
      });

      // Baik tanggal lama maupun baru harus terbuka. Tanpa pemeriksaan tanggal
      // lama, baris periode yang sudah ditutup dapat "dipindahkan" ke periode
      // terbuka lalu diubah diam-diam.
      await assertPeriodOpen(existing.date, tx);
      const lineDate = wibDateToUtcMidnight(v.date);
      await assertPeriodOpen(lineDate, tx);

      const completedMatch = await tx.bankReconciliationItem.findFirst({
        where: {
          bankStatementLineId: id,
          matched: true,
          bankReconciliation: { status: "completed" },
        },
        select: { id: true },
      });
      if (completedMatch) {
        throw new Error("Baris yang sudah masuk rekonsiliasi selesai tidak dapat diubah");
      }

      await tx.bankStatementLine.update({
        where: { id },
        data: {
          bankStatementId: v.bankStatementId,
          date: lineDate,
          description: v.description ?? null,
          amount: v.amount,
          debit: v.type === "debit" ? v.amount : 0,
          credit: v.type === "credit" ? v.amount : 0,
          type: v.type,
          reference: v.reference ?? null,
        },
      });

      await recalcBankStatementTotals(tx, v.bankStatementId);
      if (existing.bankStatementId !== v.bankStatementId) {
        await recalcBankStatementTotals(tx, existing.bankStatementId);
      }
    });

    await logActivity(
      "update",
      "BankStatementLine",
      id,
      `Mengubah baris rekening koran #${id}`,
    );
    revalidatePath("/keuangan/laporan-bank");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateBankStatementLine]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteBankStatementLine(id: number) {
  try {
    await requirePermission("create_journals");

    await prisma.$transaction(async (tx) => {
      // Dibaca dulu supaya baris yang tidak ada ditolak berisik: `delete`
      // langsung akan melempar galat Prisma yang tak terbaca, dan menelan
      // galat itu membuat pengguna melihat "berhasil" padahal barisnya masih ada.
      const line = await tx.bankStatementLine.findUnique({
        where: { id },
        select: { bankStatementId: true, date: true },
      });
      if (!line) throw new Error("Baris rekening koran tidak ditemukan");

      await assertPeriodOpen(line.date, tx);
      const completedMatch = await tx.bankReconciliationItem.findFirst({
        where: {
          bankStatementLineId: id,
          matched: true,
          bankReconciliation: { status: "completed" },
        },
        select: { id: true },
      });
      if (completedMatch) {
        throw new Error("Baris yang sudah masuk rekonsiliasi selesai tidak dapat dihapus");
      }

      await tx.bankStatementLine.delete({ where: { id } });
      await recalcBankStatementTotals(tx, line.bankStatementId);
    });

    await logActivity(
      "delete",
      "BankStatementLine",
      id,
      `Menghapus baris rekening koran #${id}`,
    );
    revalidatePath("/keuangan/laporan-bank");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteBankStatementLine]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== JOURNAL ACTIONS ====================

export async function createJournal(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    const documentNo = await generateDocumentNumber("JRN");

    // Block posting/creating into a closed accounting period
    const txDate = new Date(formData.get("transactionDate") as string);
    await assertPeriodOpen(txDate);

    // Laravel parity: parse and validate entries before creating journal
    const entriesJson = formData.get("entries") as string | null;
    const entries =
      safeJsonParse<
        {
          accountId: number;
          debit: number;
          credit: number;
          memo: string;
          costCenterId?: number;
          profitCenterId?: number;
        }[]
      >(entriesJson) ?? [];

    // Validate every entry has a valid accountId — reject early to prevent orphan header
    const validEntries = entries.filter(
      (e) => e.accountId && (e.debit > 0 || e.credit > 0),
    );
    if (validEntries.length < 2) {
      throw new Error(
        "Journal harus memiliki minimal 2 entri dengan akun dan nominal valid",
      );
    }

    const totalDebit = validEntries.reduce(
      (sum, e) => safeAdd(sum, e.debit || 0, 2),
      0,
    );
    const totalCredit = validEntries.reduce(
      (sum, e) => safeAdd(sum, e.credit || 0, 2),
      0,
    );
    if (!compareAmounts(totalDebit, totalCredit, 0)) {
      throw new Error(
        `Journal tidak balance: Total Debit ${totalDebit} ≠ Total Credit ${totalCredit}`,
      );
    }

    // Per-line validation: debit and credit must be non-negative and exclusive
    for (const entry of validEntries) {
      if ((entry.debit || 0) < 0 || (entry.credit || 0) < 0) {
        throw new Error("Nominal debit/credit tidak boleh negatif");
      }
      if ((entry.debit || 0) > 0 && (entry.credit || 0) > 0) {
        throw new Error(
          "Satu baris tidak boleh memiliki debit dan credit sekaligus",
        );
      }
    }

    // Wrap header + entries in a single transaction to prevent orphan journals
    const journal = await prisma.$transaction(async (tx) => {
      const j = await tx.journal.create({
        data: {
          journalNumber: documentNo,
          slug: await nextSlug("journal", documentNo),
          transactionDate: new Date(formData.get("transactionDate") as string),
          description: formData.get("description") as string | null,
          type: (formData.get("type") as string) || "GENERAL",
          status: "DRAFT",
          totalDebit,
          totalCredit,
          createdBy: Number(user.id),
        },
      });

      // Batch create all entries in one query (eliminates N+1)
      await tx.journalEntry.createMany({
        data: validEntries.map((entry) => ({
          journalId: j.id,
          accountId: entry.accountId,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          memo: entry.memo || null,
          costCenterId: entry.costCenterId || null,
          // Pusat laba: tanpa baris ini laporan pusat laba selalu menumpuk di
          // "Tanpa Pusat Laba" walau masternya sudah ada.
          profitCenterId: entry.profitCenterId || null,
        })),
      });

      return j;
    });

    // Associate uploaded attachments with the new journal
    const attachmentIds = formData.get("attachmentIds") as string | null;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "journal", referenceId: journal.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity("create", "Journal", journal.id, "Membuat jurnal");
    revalidatePath("/keuangan/jurnal");
    return { success: true, id: journal.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createJournal]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function postJournal(journalId: number) {
  try {
    await requirePermission("post_journals");

    const journal = await prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { entries: true },
    });

    if (journal.status !== "DRAFT") {
      throw new Error("Journal hanya bisa di-post dari status DRAFT");
    }

    // Block posting into a closed accounting period
    await assertPeriodOpen(journal.transactionDate);

    // Validate double-entry balance
    const totalDebit = journal.entries.reduce(
      (sum, e) => safeAdd(sum, Number(e.debit), 2),
      0,
    );
    const totalCredit = journal.entries.reduce(
      (sum, e) => safeAdd(sum, Number(e.credit), 2),
      0,
    );

    if (!compareAmounts(totalDebit, totalCredit, 0)) {
      throw new Error(
        `Journal tidak balance: Debit ${totalDebit} vs Credit ${totalCredit}`,
      );
    }

    const claim = await prisma.journal.updateMany({
      where: { id: journalId, status: "DRAFT" },
      data: {
        status: "POSTED",
        totalDebit,
        totalCredit,
      },
    });
    if (claim.count === 0) {
      throw new Error("Jurnal sudah diposting atau sedang diproses");
    }

    await logActivity("post", "Journal", journalId, "Posting jurnal");
    revalidatePath("/keuangan/jurnal");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postJournal]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== EXPENSE ACTIONS ====================

export async function createExpense(formData: FormData) {
  try {
    const user = await requirePermission("create_expenses");

    const parsed = parseFormData(expenseSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("EXP");

    const expense = await prisma.expense.create({
      data: {
        documentNo,
        slug: await nextSlug("expense", documentNo),
        accountId: v.accountId,
        paidFromAccountId: v.paidFromAccountId ?? null,
        projectId: v.projectId ?? null,
        costCenterId: v.costCenterId ?? null,
        amount: v.amount,
        date: v.date,
        referenceNo: v.referenceNo ?? null,
        description: v.description ?? null,
        categoryId: v.categoryId ?? null,
        vendorId: v.vendorId ?? null,
        receiptImage: v.receiptImage ?? null,
        status: "draft",
        createdBy: Number(user.id),
      },
    });

    // Associate uploaded attachments with the new expense
    const attachmentIds = formData.get("attachmentIds") as string | null;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "expense", referenceId: expense.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity("create", "Expense", expense.id, "Membuat pengeluaran");
    // Route through approval workflow if one is configured for Expense.
    await requestApprovalIfConfigured("Expense", expense.id, Number(user.id));
    revalidatePath("/keuangan/pengeluaran");
    return { success: true, id: expense.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createExpense]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function approveExpense(expenseId: number) {
  try {
    const user = await requirePermission("approve_expenses");

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });

    // An expense reachable here is either "draft" (no multi-level workflow —
    // this is the only gate) OR "approved" when a configured ApprovalWorkflow
    // already completed and approveStep flipped the status (approval.actions.ts).
    // In the latter case this call must STILL run the petty-cash sync, which the
    // workflow engine never does. Rejecting anything but "draft" (the previous
    // behaviour) left every workflow-approved expense un-synced — the petty cash
    // record was never created, understating petty cash — with no retry path
    // because approveExpense refused the non-draft status.
    if (expense.status !== "draft" && expense.status !== "approved") {
      throw new Error("Expense hanya bisa di-approve dari status draft");
    }

    // Workflow approval must be complete (no-op if no workflow configured).
    await assertApproved("Expense", expenseId);

    // Sync to PettyCash (idempotent on documentNo), THEN flip to approved.
    // Ordering matters: if the petty-cash sync fails, the expense keeps its
    // pre-approval status and the whole approveExpense is retryable. The sync is
    // idempotent on documentNo, so a retry after a partial failure will not
    // double-create the petty cash record.
    await onExpenseApprovedSyncPettyCash(expenseId, Number(user.id));

    // Guarded write: only flip when the row is still in a pre-approval state,
    // so a concurrent approver cannot double-apply the status change.
    const claim = await prisma.expense.updateMany({
      where: { id: expenseId, status: { in: ["draft", "approved"] } },
      data: { status: "approved", approvedBy: Number(user.id) },
    });
    if (claim.count === 0) {
      throw new Error("Pengeluaran sudah diproses atau status tidak valid");
    }

    await logActivity(
      "approve",
      "Expense",
      expenseId,
      "Menyetujui pengeluaran",
    );
    revalidatePath("/keuangan/pengeluaran");
    revalidatePath("/keuangan/kas-kecil");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveExpense]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function rejectExpense(expenseId: number) {
  try {
    await requirePermission("approve_expenses");

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });

    // Mirror of approveExpense: reject is the no-workflow gate. When a workflow
    // IS configured, the approval engine already sets status="rejected", so we
    // treat an already-rejected expense as an idempotent success rather than a
    // confusing error. Only pre-approval states may be rejected.
    if (expense.status === "rejected") {
      return { success: true };
    }
    if (expense.status !== "draft" && expense.status !== "pending") {
      throw new Error("Pengeluaran hanya bisa ditolak dari status draft");
    }

    const claim = await prisma.expense.updateMany({
      where: { id: expenseId, status: { in: ["draft", "pending"] } },
      data: { status: "rejected" },
    });
    if (claim.count === 0) {
      throw new Error("Pengeluaran sudah diproses atau status tidak valid");
    }

    await logActivity("reject", "Expense", expenseId, "Menolak pengeluaran");
    revalidatePath("/keuangan/pengeluaran");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[rejectExpense]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function markExpensePaid(expenseId: number) {
  try {
    await requirePermission("approve_expenses");

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });

    // Laravel parity: only approved expenses can be marked as paid (draft → approved → paid)
    if (expense.status !== "approved") {
      throw new Error(
        "Hanya pengeluaran yang sudah disetujui yang dapat ditandai sebagai dibayar",
      );
    }

    // Refuse to settle an expense that has no source of funds. `onExpenseApproved`
    // cannot post Dr. Beban / Cr. Kas-Bank without `paidFromAccountId`, and the old
    // silent early-return there flipped the expense to "paid" anyway — cash out with
    // zero GL trace. Reject it here (status untouched, retryable after the account is
    // filled in) instead of banking on that hook never staying silent again.
    if (!expense.paidFromAccountId) {
      throw new Error(
        "Pengeluaran belum punya akun sumber dana (kas/bank). Isi akun sumber dana sebelum menandai lunas — tanpa itu tidak ada jurnal yang bisa diposting.",
      );
    }

    // Post the accounting journal FIRST (Laravel parity: GL created when paid).
    // Posting before the status flip means a journal failure (e.g. closed period)
    // leaves the expense at "approved" and retryable, instead of stranding it as
    // "paid" with no GL entry. The journal's (referenceType, referenceId) unique
    // constraint already prevents any double-post on concurrent calls.
    await onExpenseApproved(expenseId);

    await prisma.expense.update({
      where: { id: expenseId },
      data: { status: "paid" },
    });

    await logActivity(
      "mark",
      "Expense",
      expenseId,
      "Menandai pengeluaran sebagai dibayar",
    );
    revalidatePath("/keuangan/pengeluaran");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[markExpensePaid]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PETTY CASH ACTIONS ====================

type PettyCashTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
  opts?: { guardNegative?: boolean },
): Promise<void> {
  const all = await tx.pettyCash.findMany({
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      documentNo: true,
      type: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
    },
  });
  const records = all.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
    type: r.type,
    amount: Number(r.amount),
  }));

  // Order-aware overdraw guard: catches backdated OUT entries inserted mid-chain
  // and edits that push a later balance below zero (the insert-time pre-check
  // only sees the tail balance, not the post-reorder chain).
  if (opts?.guardNegative) {
    const negative = findFirstNegativeBalance(records);
    if (negative) {
      throw new Error(
        `Saldo kas kecil menjadi negatif pada transaksi ${negative.record.documentNo ?? `#${negative.record.id}`} ` +
          `(saldo: ${negative.balanceAfter.toLocaleString("id-ID")}). Periksa urutan tanggal dan jumlah pengeluaran.`,
      );
    }
  }

  const balances = computePettyCashChain(records);
  const existing = new Map(all.map((r) => [r.id, r]));
  const updates = balances
    .map((b) => {
      const rec = existing.get(b.id)!;
      if (
        Number(rec.balanceBefore) !== b.balanceBefore ||
        Number(rec.balanceAfter) !== b.balanceAfter
      ) {
        return tx.pettyCash.update({
          where: { id: b.id },
          data: {
            balanceBefore: b.balanceBefore,
            balanceAfter: b.balanceAfter,
          },
        });
      }
      return null;
    })
    .filter(Boolean) as Promise<unknown>[];

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

/** Remove the accounting journal (and its entries) tied to a petty-cash record. */
async function deletePettyCashJournal(
  tx: PettyCashTx,
  pettyCashId: number,
): Promise<void> {
  const journals = await tx.journal.findMany({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
    select: { id: true },
  });
  if (journals.length === 0) return;
  const journalIds = journals.map((j) => j.id);
  await tx.journalEntry.deleteMany({
    where: { journalId: { in: journalIds } },
  });
  await tx.journal.deleteMany({ where: { id: { in: journalIds } } });
}

export async function createPettyCash(formData: FormData) {
  try {
    const user = await requirePermission("create_petty_cash");

    const parsed = parseFormData(pettyCashSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("PC");

    const type = v.type;
    const amount = v.amount;

    // Validate GL mapping before creating record
    const settings = await getSystemSettings();
    if (!settings.pettyCashAccountId) {
      return { success: false, error: "Akun Kas Kecil belum dikonfigurasi. Isi di Pengaturan > Mapping Akun terlebih dahulu." };
    }
    if (type === "IN" && !settings.cashBankAccountId) {
      return { success: false, error: "Akun Kas/Bank belum dikonfigurasi. Isi di Pengaturan > Mapping Akun terlebih dahulu." };
    }
    if (type === "OUT" && !settings.generalExpenseAccountId) {
      return { success: false, error: "Akun Beban Umum belum dikonfigurasi. Isi di Pengaturan > Mapping Akun terlebih dahulu." };
    }

    // IN: cek saldo sumber dana (kas/bank)
    if (type === "IN") {
      const sourceId = settings.cashBankAccountId;
      if (sourceId) {
        const sourceEntries = await prisma.journalEntry.findMany({
          where: { accountId: sourceId, journal: { status: "POSTED" } },
        });
        const sourceBalance = sourceEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
        if (sourceBalance < amount) {
          return { success: false, error: `Saldo akun Kas/Bank tidak mencukupi: tersedia ${sourceBalance.toLocaleString("id-ID")}, dibutuhkan ${amount.toLocaleString("id-ID")}` };
        }
      }
    }

    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    const pettyCash = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id);

      // Calculate balanceBefore from the chronologically LAST petty cash record.
      // The chain is ordered (date asc, id asc) — see recalcPettyCashChain — so
      // the tail balance must come from the max (date, id), NOT `createdAt desc`.
      // A backdated entry created later would otherwise be treated as the tail
      // and make this OUT overdraw pre-check reject/allow the wrong amount.
      const lastRecord = await tx.pettyCash.findFirst({
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
      const balanceBefore = lastRecord ? Number(lastRecord.balanceAfter) : 0;

      // Laravel parity: OUT can't exceed current balance
      if (type === "OUT" && amount > balanceBefore) {
        throw new Error(
          `Saldo kas kecil tidak cukup: tersedia ${balanceBefore}, dibutuhkan ${amount}`,
        );
      }

      const balanceAfter =
        type === "IN"
          ? safeAdd(balanceBefore, amount, 0)
          : safeSubtract(balanceBefore, amount, 0);

      const created = await tx.pettyCash.create({
        data: {
          documentNo,
          slug: await nextSlug("pettyCash", documentNo),
          type,
          amount,
          balanceBefore,
          balanceAfter,
          date: v.date,
          accountId: v.accountId ?? null,
          referenceNo: v.referenceNo ?? null,
          description: v.description ?? null,
          projectId: v.projectId ?? null,
          vendorId: v.vendorId ?? null,
          categoryId: v.categoryId ?? null,
          createdBy: Number(user.id),
        },
      });
      // Keep the running-balance chain correct regardless of insertion order.
      await recalcPettyCashChain(tx, { guardNegative: true });
      // Post the GL journal INSIDE the same tx so a posting failure (closed
      // period, unconfigured account) rolls back the subledger row instead of
      // leaving a committed petty-cash row with no journal (subledger/GL drift).
      await onPettyCashCreated(created.id, Number(user.id), tx);
      return created;
    });

    // Associate uploaded attachments with the new petty cash record
    const attachmentIds = v.attachmentIds as string | undefined;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "petty_cash", referenceId: pettyCash.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity(
      "create",
      "PettyCash",
      pettyCash.id,
      "Membuat transaksi kas kecil",
    );
    revalidatePath("/keuangan/kas-kecil");
    return { success: true, id: pettyCash.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPettyCash]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BANK RECONCILIATION ACTIONS ====================

export async function createBankReconciliation(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    const parsed = parseFormData(bankReconciliationSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const reconciliationNumber = await generateDocumentNumber("REC");

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        reconciliationNumber,
        slug: await nextSlug("bankReconciliation", reconciliationNumber),
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
    });

    await logActivity(
      "create",
      "BankReconciliation",
      reconciliation.id,
      "Membuat rekonsiliasi bank",
    );
    revalidatePath("/keuangan/rekonsiliasi-bank");
    return { success: true, id: reconciliation.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createBankReconciliation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function matchReconciliationLine(
  reconciliationId: number,
  lineId: number,
  journalEntryId: number,
) {
  try {
    await requirePermission("post_journals");

    // Semua ID datang dari klien (Server Action tetap bisa dipanggil langsung),
    // jadi hubungan akun/periode/jurnal wajib diperiksa di sini, bukan dipercaya
    // dari pilihan UI.
    await prisma.$transaction(async (tx) => {
      const recon = await tx.bankReconciliation.findUniqueOrThrow({
        where: { id: reconciliationId },
        select: { status: true, accountId: true, periodStart: true, periodEnd: true },
      });
      if (recon.status !== "draft") {
        throw new Error("Hanya rekonsiliasi dengan status draft yang dapat dicocokkan");
      }

      const line = await tx.bankStatementLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { date: true, bankStatement: { select: { accountId: true } } },
      });
      if (line.bankStatement.accountId !== recon.accountId) {
        throw new Error("Baris rekening koran bukan milik akun rekonsiliasi ini");
      }
      if (recon.periodStart && line.date < recon.periodStart) {
        throw new Error("Tanggal baris rekening koran berada di luar periode rekonsiliasi");
      }
      if (recon.periodEnd && line.date > recon.periodEnd) {
        throw new Error("Tanggal baris rekening koran berada di luar periode rekonsiliasi");
      }

      const journalEntry = await tx.journalEntry.findUniqueOrThrow({
        where: { id: journalEntryId },
        select: {
          accountId: true,
          journal: { select: { status: true, deletedAt: true, transactionDate: true } },
        },
      });
      if (journalEntry.accountId !== recon.accountId) {
        throw new Error("Baris jurnal bukan milik akun rekonsiliasi ini");
      }
      if (journalEntry.journal.status !== "POSTED" || journalEntry.journal.deletedAt) {
        throw new Error("Hanya baris jurnal posted yang dapat dicocokkan");
      }
      if (
        (recon.periodStart && journalEntry.journal.transactionDate < recon.periodStart) ||
        (recon.periodEnd && journalEntry.journal.transactionDate > recon.periodEnd)
      ) {
        throw new Error("Tanggal jurnal berada di luar periode rekonsiliasi");
      }

      // Dedupe: satu baris rekening hanya dapat memiliki satu kecocokan pada
      // rekonsiliasi yang sama.
      const existing = await tx.bankReconciliationItem.findFirst({
        where: {
          bankReconciliationId: reconciliationId,
          bankStatementLineId: lineId,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.bankReconciliationItem.update({
          where: { id: existing.id },
          data: { journalEntryId, matched: true },
        });
      } else {
        await tx.bankReconciliationItem.create({
          data: {
            bankReconciliationId: reconciliationId,
            bankStatementLineId: lineId,
            journalEntryId,
            matched: true,
          },
        });
      }
    });

    await logActivity(
      "match",
      "BankReconciliation",
      reconciliationId,
      "Mencocokkan baris rekonsiliasi bank",
    );
    revalidatePath("/keuangan/rekonsiliasi-bank");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[matchReconciliationLine]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function completeReconciliation(reconciliationId: number) {
  try {
    await requirePermission("post_journals");

    // Laravel parity: only draft reconciliations can be completed
    const reconciliation = await prisma.bankReconciliation.findUniqueOrThrow({
      where: { id: reconciliationId },
      include: { items: true },
    });

    if (reconciliation.status !== "draft") {
      throw new Error(
        "Hanya rekonsiliasi dengan status draft yang dapat diselesaikan",
      );
    }

    if (reconciliation.items.length === 0) {
      throw new Error("Rekonsiliasi belum memiliki baris yang dicocokkan");
    }

    // Semua baris yang telah dimasukkan ke rekonsiliasi wajib sudah matched.
    const unmatchedItems = reconciliation.items.filter((item) => !item.matched);
    if (unmatchedItems.length > 0) {
      throw new Error(
        `${unmatchedItems.length} baris belum di-match. Semua baris harus di-match sebelum menyelesaikan rekonsiliasi.`,
      );
    }

    // Numeric balance gate (Laravel BankReconciliation::calculateDifference + isBalanced).
    // Only UNCLEARED outstanding deposits/payments adjust the book balance.
    //   adjusted_book_balance = book_balance + outstanding_deposits − outstanding_payments
    //   difference            = statement_ending_balance − adjusted_book_balance
    // Block completion unless |difference| < 0.01. Persist the computed figures
    // so the report reflects the reconciliation math (these columns existed in
    // the schema but were never populated before).
    const outstandingDeposits = reconciliation.items
      .filter((i) => !i.cleared && i.type === "outstanding_deposit")
      .reduce((s, i) => safeAdd(s, Number(i.amount), 2), 0);
    const outstandingPayments = reconciliation.items
      .filter((i) => !i.cleared && i.type === "outstanding_check")
      .reduce((s, i) => safeAdd(s, Number(i.amount), 2), 0);
    const adjustedBookBalance = safeSubtract(
      safeAdd(Number(reconciliation.bookBalance), outstandingDeposits, 2),
      outstandingPayments,
      2,
    );
    const difference = safeSubtract(
      Number(reconciliation.statementBalance),
      adjustedBookBalance,
      2,
    );
    if (Math.abs(difference) >= 0.01) {
      throw new Error(
        `Rekonsiliasi belum seimbang. Selisih: ${difference.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
          `Tambahkan item penyesuaian (setoran/cek beredar) atau periksa saldo sebelum menyelesaikan.`,
      );
    }

    await prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: "completed",
        completedAt: new Date(),
        outstandingDeposits,
        outstandingPayments,
        adjustedBookBalance,
        difference,
      },
    });

    await logActivity(
      "complete",
      "BankReconciliation",
      reconciliationId,
      "Menyelesaikan rekonsiliasi bank",
    );
    revalidatePath("/keuangan/rekonsiliasi-bank");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[completeReconciliation]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== BUDGET ACTIONS ====================


// ==================== COST CENTER ACTIONS ====================

/**
 * Pusat laba (profit center) — satu-satunya jalur tulis `profit_centers`.
 *
 * Model ini tidak punya jalur tulis sama sekali sebelumnya (hanya skrip seed),
 * padahal laporan pusat laba membacanya dan skema sudah punya
 * `JournalEntry.profitCenterId`. Akibatnya laporan selalu menumpuk di "Tanpa
 * Pusat Laba" — angka yang terlihat wajar tetapi tidak berguna.
 */

export async function createProfitCenter(formData: FormData) {
  try {
    await requirePermission("create_profit_centers");

    const parsed = parseFormData(profitCenterSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    const center = await prisma.profitCenter.create({
      data: { code: v.code, name: v.name },
    });

    await logActivity("create", "ProfitCenter", center.id, `Menambah pusat laba ${v.code}`);
    revalidatePath("/keuangan/pusat-laba");
    return { success: true as const, id: center.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    // `code` unik di skema: kegagalan paling sering adalah kode terpakai.
    const message = getErrorMessage(e) || "";
    if (message.includes("Unique constraint") || message.includes("1062")) {
      return { success: false as const, error: "Kode pusat laba sudah digunakan" };
    }
    console.error("[createProfitCenter]", message || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateProfitCenter(id: number, formData: FormData) {
  try {
    await requirePermission("edit_profit_centers");

    const parsed = parseFormData(profitCenterSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    await prisma.profitCenter.update({
      where: { id },
      data: { code: v.code, name: v.name },
    });

    await logActivity("update", "ProfitCenter", id, `Mengubah pusat laba ${v.code}`);
    revalidatePath("/keuangan/pusat-laba");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    const message = getErrorMessage(e) || "";
    if (message.includes("Unique constraint") || message.includes("1062")) {
      return { success: false as const, error: "Kode pusat laba sudah digunakan" };
    }
    console.error("[updateProfitCenter]", message || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteProfitCenter(id: number) {
  try {
    await requirePermission("delete_profit_centers");

    // Guard: CostCenter.profitCenterId menunjuk ke sini. FK-nya TIDAK punya
    // onDelete (relasi implisit di skema), jadi hapus mentah melempar P2003
    // mentah ke UI. Tolak dulu dengan pesan yang menyebut jumlah pemakai.
    const usedByCostCenters = await prisma.costCenter.count({ where: { profitCenterId: id } });
    if (usedByCostCenters > 0) {
      return {
        success: false as const,
        error: `Pusat laba masih digunakan oleh ${usedByCostCenters} pusat biaya. Lepaskan dulu sebelum menghapus.`,
      };
    }

    await prisma.profitCenter.delete({ where: { id } });

    await logActivity("delete", "ProfitCenter", id, `Menghapus pusat laba #${id}`);
    revalidatePath("/keuangan/pusat-laba");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteProfitCenter]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createCostCenter(formData: FormData) {
  try {
    await requirePermission("create_cost_centers");

    const rawNameCC2 = (formData.get("name") as string | null)?.trim()
    if (rawNameCC2) {
      const existing = await prisma.costCenter.findFirst({ where: { name: rawNameCC2 }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }


    const parsed = parseFormData(costCenterSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const costCenter = await prisma.costCenter.create({
      data: {
        code: v.code,
        name: v.name,
        slug: await nextSlug("costCenter", v.name),
        description: v.description ?? null,
        isActive: v.isActive,
        parentId: v.parentId ?? null,
      },
    });

    await logActivity(
      "create",
      "CostCenter",
      costCenter.id,
      "Membuat pusat biaya",
    );
    revalidatePath("/keuangan/pusat-biaya");
    return { success: true, id: costCenter.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createCostCenter]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateCostCenter(id: number, formData: FormData) {
  try {
    await requirePermission("edit_cost_centers");

    const parsed = parseFormData(costCenterSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    await prisma.costCenter.update({
      where: { id },
      data: {
        code: v.code,
        name: v.name,
        slug: await nextSlug("costCenter", v.name, { excludeId: id }),
        description: v.description ?? null,
        isActive: v.isActive,
        // Must be written on update as well: cost-center-form renders the "Induk"
        // combobox and createCostCenter already persists parentId. Without this the
        // hierarchy edit was silently discarded (UI still reported success).
        parentId: v.parentId ?? null,
      },
    });

    await logActivity("update", "CostCenter", id, "Memperbarui pusat biaya");
    revalidatePath("/keuangan/pusat-biaya");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateCostCenter]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteJournal(id: number) {
  try {
    await requirePermission("delete_journals");

    const journal = await prisma.journal.findUniqueOrThrow({ where: { id } });
    if (journal.status === "POSTED") {
      throw new Error("Tidak bisa menghapus journal yang sudah POSTED");
    }

    // Laravel parity: cascade delete entries then journal
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: { journalId: id } });
      await tx.transactionAttachment.deleteMany({
        where: { referenceType: "Journal", referenceId: id },
      });
      await tx.journal.delete({ where: { id } });
    });

    await logActivity("delete", "Journal", id, "Menghapus jurnal");
    revalidatePath("/keuangan/jurnal");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteJournal]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteExpense(id: number) {
  try {
    await requirePermission("delete_expenses");

    const expense = await prisma.expense.findUniqueOrThrow({ where: { id } });
    // Laravel parity: only draft/pending expenses can be deleted
    if (expense.status === "approved" || expense.status === "paid") {
      throw new Error(
        "Tidak bisa menghapus expense yang sudah approved atau paid",
      );
    }

    // Atomicity: the attachment deleteMany + expense delete must commit
    // together. Without the wrapper, a failure in either step leaves
    // attachments orphaned with the wrong referenceId (or pointing at a
    // deleted expense) — the user retries and the receipts are gone, or the
    // expense vanishes but the receipts persist with referenceId pointing at
    // a row that no longer exists.
    await prisma.$transaction(async (tx) => {
      await tx.transactionAttachment.deleteMany({
        where: { referenceType: "Expense", referenceId: id },
      });
      await tx.expense.delete({ where: { id } });
      await tx.approval.deleteMany({
        where: { referenceType: "Expense", referenceId: id },
      });
    });

    await logActivity("delete", "Expense", id, "Menghapus pengeluaran");
    revalidatePath("/keuangan/pengeluaran");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteExpense]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deletePettyCash(id: number) {
  try {
    await requirePermission("delete_petty_cash");

    await prisma.$transaction(async (tx) => {
      // Remove the linked journal (avoid orphaned GL entries), delete the record,
      // then recompute the running balance for all remaining records.
      await deletePettyCashJournal(tx, id);
      await tx.transactionAttachment.deleteMany({
        where: { referenceType: "PettyCash", referenceId: id },
      });
      await tx.pettyCash.delete({ where: { id } });
      await recalcPettyCashChain(tx, { guardNegative: true });
    });

    await logActivity(
      "delete",
      "PettyCash",
      id,
      "Menghapus transaksi kas kecil",
    );
    revalidatePath("/keuangan/kas-kecil");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePettyCash]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


export async function deleteCostCenter(id: number) {
  try {
    await requirePermission("delete_cost_centers");

    // Guard: pusat biaya dirujuk banyak dokumen operasional. Kolom-kolom di
    // bawah TIDAK punya FK di skema (plain Int?) — hapus mentah meninggalkan
    // int yatim yang tak bisa direkonstruksi. Yang ber-FK pun ON DELETE
    // SET NULL — hapus mentah diam-diam mencabut tag pusat biaya dari riwayat.
    // Tolak dulu dengan pesan yang menyebut jumlah pemakai per area.
    const [children, payrolls, materialIssues, projects, expenses] = await Promise.all([
      prisma.costCenter.count({ where: { parentId: id } }),
      prisma.payroll.count({ where: { costCenterId: id } }),
      prisma.materialIssue.count({ where: { costCenterId: id } }),
      prisma.project.count({ where: { costCenterId: id } }),
      prisma.expense.count({ where: { costCenterId: id } }),
    ]);
    const usages = [
      children > 0 ? `${children} pusat biaya anak` : null,
      payrolls > 0 ? `${payrolls} penggajian` : null,
      materialIssues > 0 ? `${materialIssues} pengeluaran material` : null,
      projects > 0 ? `${projects} proyek` : null,
      expenses > 0 ? `${expenses} pengeluaran` : null,
    ].filter((u): u is string => u !== null);
    if (usages.length > 0) {
      return {
        success: false,
        error: `Pusat biaya masih digunakan (${usages.join(", ")}). Lepaskan dulu sebelum menghapus.`,
      };
    }

    await prisma.costCenter.delete({ where: { id } });

    await logActivity("delete", "CostCenter", id, "Menghapus pusat biaya");
    revalidatePath("/keuangan/pusat-biaya");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteCostCenter]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateJournal(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_journals");

    // Laravel parity: only DRAFT journals can be edited
    const existing = await prisma.journal.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      throw new Error("Journal yang sudah diposting tidak dapat diubah");
    }

    // Block editing into a closed accounting period (both old and new dates)
    await assertPeriodOpen(existing.transactionDate);
    await assertPeriodOpen(new Date(formData.get("transactionDate") as string));

    // Parse and validate entries with the same rigor as createJournal —
    // previously the edit path ignored line entries entirely, so edited lines
    // were silently discarded and the balance invariant was never re-checked.
    const entriesJson = formData.get("entries") as string | null;
    const entries =
      safeJsonParse<
        {
          accountId: number;
          debit: number;
          credit: number;
          memo: string;
          costCenterId?: number;
          profitCenterId?: number;
        }[]
      >(entriesJson) ?? [];
    const validEntries = entries.filter(
      (e) => e.accountId && (e.debit > 0 || e.credit > 0),
    );
    if (validEntries.length < 2) {
      throw new Error(
        "Journal harus memiliki minimal 2 entri dengan akun dan nominal valid",
      );
    }

    const totalDebit = validEntries.reduce(
      (sum, e) => safeAdd(sum, e.debit || 0, 2),
      0,
    );
    const totalCredit = validEntries.reduce(
      (sum, e) => safeAdd(sum, e.credit || 0, 2),
      0,
    );
    if (!compareAmounts(totalDebit, totalCredit, 0)) {
      throw new Error(
        `Journal tidak balance: Total Debit ${totalDebit} ≠ Total Credit ${totalCredit}`,
      );
    }
    for (const entry of validEntries) {
      if ((entry.debit || 0) < 0 || (entry.credit || 0) < 0) {
        throw new Error("Nominal debit/credit tidak boleh negatif");
      }
      if ((entry.debit || 0) > 0 && (entry.credit || 0) > 0) {
        throw new Error(
          "Satu baris tidak boleh memiliki debit dan credit sekaligus",
        );
      }
    }

    // Fix #14: Jangan generate documentNo baru dan jangan reset totals ke 0
    // Replace header + entries atomically (delete old entries, recreate from form).
    //
    // Type preservation: the previous code wrote `type: formData.get("type") || "GENERAL"`,
    // which silently reset auto-posted journals (COGS=ADJUSTMENT, Payroll=AUTO, ...)
    // back to "GENERAL" on every accountant edit. The journal-edit form does
    // not render a `type` field at all (the type is system-assigned at create
    // time), so the form never sends one. Preserve the existing type when the
    // form omits the field, and only accept an explicit override when sent.
    const submittedType = (formData.get("type") as string | null)?.trim();
    const journalType = submittedType && submittedType.length > 0
      ? submittedType
      : existing.type;

    const journal = await prisma.$transaction(async (tx) => {
      const j = await tx.journal.update({
        where: { id },
        data: {
          transactionDate: new Date(formData.get("transactionDate") as string),
          description: formData.get("description") as string | null,
          type: journalType,
          totalDebit,
          totalCredit,
          slug: await nextSlug("journal", existing.journalNumber, { excludeId: id }),
        },
      });

      await tx.journalEntry.deleteMany({ where: { journalId: id } });
      await tx.journalEntry.createMany({
        data: validEntries.map((entry) => ({
          journalId: id,
          accountId: entry.accountId,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          memo: entry.memo || null,
          costCenterId: entry.costCenterId || null,
          // Sama seperti jalur buat: pusat laba harus ikut tersimpan saat entri
          // diganti, kalau tidak mengubah jurnal akan menghapus pusat labanya.
          profitCenterId: entry.profitCenterId || null,
        })),
      });

      return j;
    });

    // Associate uploaded attachments
    const attachmentIds = formData.get("attachmentIds") as string | null;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "journal", referenceId: journal.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity("update", "Journal", journal.id, "Memperbarui jurnal");
    revalidatePath("/keuangan/jurnal");
    return { success: true, id: journal.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateJournal]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function reverseJournal(journalId: number) {
  try {
    const user = await requirePermission("post_journals");

    const journal = await prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { entries: true },
    });

    // Laravel parity: only posted journals can be reversed
    if (journal.status !== "POSTED") {
      throw new Error("Hanya journal yang sudah POSTED yang bisa di-reverse");
    }

    // Atomic conditional claim — serialize concurrent reverse requests so only one
    // reversal journal is created; duplicates get a clean error instead of
    // corrupting the GL with two reversals.
    const claim = await prisma.journal.updateMany({
      where: { id: journalId, status: "POSTED" },
      data: { status: "REVERSING" },
    });
    if (claim.count === 0) {
      const current = await prisma.journal.findUnique({
        where: { id: journalId },
        select: { status: true },
      });
      throw new Error(
        current?.status === "REVERSED"
          ? "Jurnal sudah pernah dibalik"
          : current
            ? `Jurnal tidak bisa dibalik (status: ${current.status})`
            : "Jurnal tidak ditemukan",
      );
    }

    // Wrap the period check, document-number allocation, and the reversal tx in
    // a single rollback boundary. The claim flips POSTED -> REVERSING, and if
    // anything after the claim throws (closed period, sequence generator down,
    // unique collision on journalNumber, etc.) the journal must NOT be left
    // stuck in REVERSING — that status is invisible to the GL (only POSTED
    // journals are summed) and the claim requires POSTED, so the journal
    // becomes permanently unrecoverable. Restore the claim so the user can
    // retry.
    let documentNo: string;
    try {
      // Cannot reverse a journal that belongs to a closed period
      await assertPeriodOpen(journal.transactionDate);

      documentNo = await generateDocumentNumber("JRN-RV");

      await prisma.$transaction(async (tx) => {
        const reversalJournal = await tx.journal.create({
          data: {
            journalNumber: documentNo,
            // Date the reversal to the ORIGINAL journal's transactionDate, not
            // today. The reversal is a correction of the original period: if it
            // were stamped with today's date, a period income statement for the
            // original period would still include the (now REVERSED) original
            // with no offsetting entry in that period, and the reversal would
            // wrongly land in the current period. Using the original date keeps
            // the (REVERSED original + POSTED reversal) pair inside the same
            // period, so PERIOD and CUMULATIVE reports both net to zero.
            // Safe because we only get here after assertPeriodOpen(original date)
            // passed, i.e. the original period is still open.
            transactionDate: journal.transactionDate,
            description: `Reversal of ${journal.journalNumber}: ${journal.description ?? ""}`,
            type: journal.type,
            status: "POSTED",
            referenceType: "Journal",
            referenceId: journal.id,
            totalDebit: journal.totalDebit,
            totalCredit: journal.totalCredit,
            createdBy: Number(user.id),
          },
        });

        // Batch create reversal entries (eliminates N+1)
        await tx.journalEntry.createMany({
          data: journal.entries.map((entry) => ({
            journalId: reversalJournal.id,
            accountId: entry.accountId,
            debit: entry.credit,
            credit: entry.debit,
            memo: `Reversal: ${entry.memo ?? ""}`,
            costCenterId: entry.costCenterId,
            profitCenterId: entry.profitCenterId,
          })),
        });

        await tx.journal.update({
          where: { id: journalId },
          data: { status: "REVERSED" },
        });
      });
    } catch (e) {
      // Tx failed (or a pre-tx check failed) after the claim flipped status to
      // REVERSING — roll back the claim so the journal can be retried instead of
      // being stuck in limbo.
      await prisma.journal.updateMany({
        where: { id: journalId, status: "REVERSING" },
        data: { status: "POSTED" },
      });
      throw e;
    }

    await logActivity("reverse", "Journal", journalId, "Membalik jurnal");
    revalidatePath("/keuangan/jurnal");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reverseJournal]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateExpense(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_expenses");

    // Validate input with the same Zod schema as createExpense — the edit path
    // previously hand-parsed formData (safeId/requireNumber), bypassing the
    // schema's positive-amount guard and max-length string constraints, so an
    // edit could push a draft expense to a non-positive/overflowed amount that
    // the create path would have rejected.
    const parsed = parseFormData(expenseSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    // Laravel parity: only draft expenses can be edited
    const existingExpense = await prisma.expense.findUniqueOrThrow({
      where: { id },
    });
    if (existingExpense.status !== "draft") {
      throw new Error(
        "Hanya pengeluaran dengan status draft yang dapat diubah",
      );
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        accountId: v.accountId,
        paidFromAccountId: v.paidFromAccountId ?? null,
        projectId: v.projectId ?? null,
        costCenterId: v.costCenterId ?? null,
        amount: v.amount,
        date: v.date,
        referenceNo: v.referenceNo ?? null,
        description: v.description ?? null,
        categoryId: v.categoryId ?? null,
        vendorId: v.vendorId ?? null,
        receiptImage: v.receiptImage ?? null,
        status: "draft",
        slug: await nextSlug("expense", existingExpense.documentNo, { excludeId: id }),
      },
    });

    // Associate uploaded attachments with the new expense
    const attachmentIds = v.attachmentIds as string | undefined;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "expense", referenceId: expense.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity(
      "update",
      "Expense",
      expense.id,
      "Memperbarui pengeluaran",
    );
    revalidatePath("/keuangan/pengeluaran");
    return { success: true, id: expense.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateExpense]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_petty_cash");

    // Validate input with the same Zod schema as createPettyCash — the edit path
    // previously hand-parsed formData, bypassing the schema's type enum (IN/OUT)
    // validation and positive amount constraint, which could corrupt the chain
    // or store invalid transaction type strings.
    const parsed = parseFormData(pettyCashSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const type = v.type;
    const amount = v.amount;

    const pettyCash = await prisma.$transaction(async (tx) => {
      // Existing documentNo is preserved across edits; reuse it to keep the slug
      // stable (slug is derived from the immutable document number).
      const existingPettyCash = await tx.pettyCash.findUniqueOrThrow({
        where: { id },
        select: { documentNo: true },
      });

      // Remove the stale journal so it can be rebuilt with the new amount/type
      // (the create-hook is idempotent and would otherwise skip the update).
      await deletePettyCashJournal(tx, id);

      const updated = await tx.pettyCash.update({
        where: { id },
        data: {
          type,
          amount,
          date: v.date,
          accountId: v.accountId ?? null,
          referenceNo: v.referenceNo ?? null,
          description: v.description ?? null,
          projectId: v.projectId ?? null,
          vendorId: v.vendorId ?? null,
          categoryId: v.categoryId ?? null,
          slug: await nextSlug("pettyCash", existingPettyCash.documentNo, { excludeId: id }),
        },
      });

      // Recompute running balances for the whole chain (this + subsequent records).
      await recalcPettyCashChain(tx, { guardNegative: true });

      // Rebuild the journal INSIDE the same tx. Critical: the delete above is
      // already in-tx, so re-posting here keeps delete+recreate atomic — a
      // posting failure (closed period, missing account) rolls back the delete
      // too, instead of leaving the row with NO journal (GL/subledger drift).
      await onPettyCashCreated(updated.id, Number(user.id), tx);
      return updated;
    });

    // Associate uploaded attachments with the new petty cash record
    const attachmentIds = v.attachmentIds as string | undefined;
    if (attachmentIds) {
      await prisma.$transaction((tx) => attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "petty_cash", referenceId: pettyCash.id, uploadedBy: Number(user.id),
      }));
    }

    await logActivity(
      "update",
      "PettyCash",
      pettyCash.id,
      "Memperbarui transaksi kas kecil",
    );
    revalidatePath("/keuangan/kas-kecil");
    return { success: true, id: pettyCash.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePettyCash]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

