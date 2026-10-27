"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { safeAdd, safeSubtract, compareAmounts, safeRound } from "@/lib/utils/math";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { checkIdempotency } from "@/lib/utils/idempotency";
import {
  onExpenseApproved,
  onPettyCashCreated,
  onReimbursementClaimApproved,
  onReimbursementClaimPaid,
  REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
} from "@/lib/hooks/accounting.hook";
import {
  evaluateReimbursementApprovalSod,
  evaluateReimbursementApprovedAmount,
  evaluateReimbursementEvidence,
  evaluateReimbursementPaymentAmount,
} from "@/lib/reports/reimbursement";
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
  journalSchema,
  updateJournalSchema,
  dateOnly,
} from "@/lib/validations/finance.schemas";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  parseL3Tag,
  resolveL3WorkOrder,
  assertExpenseL3AccountAllowed,
  assertNoDuplicateL3,
  writeL3ActivityLog,
} from "@/lib/services/late-cost-l3.service";
import { getSystemSettings } from "@/lib/utils/settings";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { YEAR_END_CLOSING_REFERENCE_TYPE } from "@/lib/reports/year-end-closing";
import { REVERSAL_JOURNAL_REVERSAL_ERROR, YEAR_END_CLOSING_GENERIC_REVERSAL_ERROR } from "@/lib/services/journal.service";
import {
  requestApprovalIfConfigured,
  assertApproved,
} from "@/lib/services/approval-workflow.service";
import {
  computePettyCashChain,
  findFirstNegativeBalance,
} from "@/lib/finance/petty-cash-chain";
import { attachPendingTransactionAttachments, deleteTransactionAttachmentsTx, removeAttachmentFiles } from "@/lib/services/transaction-attachment.service";
import { nextSlug } from "@/lib/utils/slug-db";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

// ==================== BANK STATEMENT ACTIONS ====================

export async function createBankStatement(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    const parsed = parseFormData(bankStatementSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    // R-09: tulis header + cek periode dalam satu tx (cek di dalam, dengan
    // tx) — cek luar-tx tanpa kunci bisa disela tutup-periode sebelum
    // header tertulis. Baris header lahir draft; tanggal header tetap
    // tanggal dokumen keuangan.
    const bankStatement = await prisma.$transaction(async (tx) => {
      const stmtDate = wibDateToUtcMidnight(v.date);
      await assertPeriodOpen(stmtDate, tx);
      return tx.bankStatement.create({
        data: {
          accountId: v.accountId,
          bankId: v.bankId ?? null,
          accountNumber: v.accountNumber ?? null,
          date: stmtDate,
          reference: v.reference ?? null,
          // Referensi boleh kosong; tanpa batang cadangan slug jatuh ke
          // "item" generik. Batang cadangan: akun + tanggal dokumen.
          slug: await nextSlug("bankStatement", v.reference ?? `rekening-${v.accountId}-${v.date}`),
          periodStart: v.periodStart ? wibDateToUtcMidnight(v.periodStart) : null,
          periodEnd: v.periodEnd ? wibDateToUtcMidnight(v.periodEnd) : null,
          openingBalance: v.openingBalance,
          closingBalance: v.closingBalance,
          notes: v.notes ?? null,
          status: "draft",
          uploadedBy: Number(user.id),
        },
      });
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
 * R-12: kunci baris header `bank_statements` (FOR UPDATE) sebelum menulis
 * baris + `recalcBankStatementTotals`.
 *
 * Tanpa kunci header, dua transaksi yang menulis baris BERBEDA pada header
 * sama bisa berlari bersamaan: keduanya agregat sebelum keduanya update
 * header, lalu update terakhir menang dengan angka yang belum mencakup
 * baris transaksi lain (total basi). Kunci header menserialkan pasangan
 * (tulis baris + recalc) per header.
 *
 * Id di-dedupe + diurutkan naik, lalu dikunci dalam SATU query
 * `ORDER BY id ... FOR UPDATE` — urutan global yang sama untuk semua
 * pemanggil mencegah deadlock antar jalur yang mengunci dua header
 * (update baris yang pindah header).
 *
 * Urutan lock global jalur baris rekening koran:
 * baris -> header(s) -> rekonsiliasi. Jalur match/unmatch/complete tidak
 * menulis baris bank statement dan tidak memanggil recalc, jadi tidak
 * mengambil kunci header; jalur itu tetap baris -> rekonsiliasi, yang
 * konsisten karena header tidak pernah diambil sesudah rekonsiliasi.
 *
 * R-15: `assertPeriodOpen(tx)` mengunci baris setting, jadi urutan penuh
 * penulis baris: baris (bila ada) -> header(s) -> setting -> rekonsiliasi
 * (update/delete) / -> tulis baris + recalc (create). Setting selalu
 * sesudah header di semua penulis baris. Aman karena tutup-periode hanya
 * menahan setting dan tidak pernah menunggu header/baris/jurnal lain.
 */
async function lockBankStatementHeaders(
  tx: BankStatementTx,
  bankStatementIds: readonly number[],
) {
  const ids = [...new Set(bankStatementIds)].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM bank_statements WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}


/**
 * Kunci induk rekonsiliasi yang terhubung (terurut naik) lalu tolak bila ada
 * yang sudah selesai. Urutan di pemanggil TIDAK berubah: helper ini dipanggil
 * persis di titik blok ini dulu berada (sesudah lock baris/header, sebelum
 * tulis baris), jadi urutan lock baris -> header -> rekonsiliasi tetap.
 */
async function lockReconParentsAndAssertNotCompleted(
  tx: BankStatementTx,
  bankStatementLineId: number,
  completedErrorMessage: string,
) {
  const matchedRecons = await tx.bankReconciliationItem.findMany({
    where: { bankStatementLineId, matched: true },
    select: { bankReconciliationId: true },
  });
  const reconIds = [...new Set(matchedRecons.map((m) => m.bankReconciliationId))].sort(
    (a, b) => a - b,
  );
  for (const reconId of reconIds) {
    await tx.$executeRaw`SELECT id FROM bank_reconciliations WHERE id = ${reconId} FOR UPDATE`;
  }
  const completedMatch = await tx.bankReconciliationItem.findFirst({
    where: {
      bankStatementLineId,
      matched: true,
      bankReconciliation: { status: "completed" },
    },
    select: { id: true },
  });
  if (completedMatch) {
    throw new Error(completedErrorMessage);
  }
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

    const line = await prisma.$transaction(async (tx) => {
      // R-15: kunci header SEBELUM assertPeriodOpen — samakan urutan lock
      // dengan update/delete (baris [bila ada] -> header -> setting).
      // Dulu create ambil setting dulu lalu header, sedangkan
      // update/delete ambil baris -> header -> setting: dua penulis baris
      // pada header sama bisa membentuk siklus tunggu
      // (create: setting -> header, update: header -> setting).
      // Protokol benar: tutup-periode hanya menahan kunci setting dan
      // tidak pernah menunggu header/baris/jurnal lain, jadi setting
      // selalu terakhir aman; antar-penulis baris kini urutan sama.
      // Cek periode tetap di DALAM tx dengan tx (R-09) — tutup-periode
      // tidak bisa menyelip di antara cek dan tulis.
      await lockBankStatementHeaders(tx, [v.bankStatementId]);
      await assertPeriodOpen(lineDate, tx);
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
      // R-04: kunci BARIS dulu, baru baca — tanpa lock, match bersamaan bisa
      // selip di antara baca dan tulis (TOCTOU), dan daftar induk dari item
      // bisa kosong (= nol lock) tepat saat match+complete menyerbu.
      // Urutan lock konsisten di semua jalur (baris dulu, baru induk) agar
      // tak deadlock dengan match/unmatch/complete.
      await tx.$executeRaw`SELECT id FROM bank_statement_lines WHERE id = ${id} FOR UPDATE`;

      // Baris dibaca ulang sesudah lock: baris yang tidak ada harus GAGAL
      // (bukan "sukses" palsu), dan bila barisnya berpindah rekening koran,
      // header LAMA juga wajib dihitung ulang — kalau tidak totalnya tertinggal.
      const existing = await tx.bankStatementLine.findUniqueOrThrow({
        where: { id },
        select: { bankStatementId: true, date: true },
      });

      // R-12: kunci header LAMA + BARU (terurut oleh helper) sesudah baris,
      // sebelum induk rekonsiliasi — urutan lock global:
      // baris -> header(s) -> rekonsiliasi. Kedua header harus terkunci
      // sebelum update + recalc keduanya, agar pindah header tidak balapan
      // dengan penulis baris lain di salah satu header.
      await lockBankStatementHeaders(tx, [
        existing.bankStatementId,
        v.bankStatementId,
      ]);

      // Baik tanggal lama maupun baru harus terbuka. Tanpa pemeriksaan tanggal
      // lama, baris periode yang sudah ditutup dapat "dipindahkan" ke periode
      // terbuka lalu diubah diam-diam.
      await assertPeriodOpen(existing.date, tx);
      const lineDate = wibDateToUtcMidnight(v.date);
      await assertPeriodOpen(lineDate, tx);

      // Induk dikunci (terurut) lalu hubungan+status dibaca ulang — tanpa
      // lock, complete bersamaan bisa selip di antara cek dan update.
      // Urutan lock konsisten dengan match/unmatch/complete (baris dulu).
      await lockReconParentsAndAssertNotCompleted(
        tx,
        id,
        "Baris yang sudah masuk rekonsiliasi selesai tidak dapat diubah",
      );

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
      // R-04: kunci BARIS dulu, baru baca — tanpa lock, delete bersamaan
      // match bisa selip di antara baca dan hapus (TOCTOU).
      // Urutan lock konsisten dengan match/unmatch/complete (baris dulu).
      await tx.$executeRaw`SELECT id FROM bank_statement_lines WHERE id = ${id} FOR UPDATE`;

      // Dibaca ulang sesudah lock supaya baris yang tidak ada ditolak
      // berisik: `delete` langsung akan melempar galat Prisma yang tak
      // terbaca, dan menelan galat itu membuat pengguna melihat "berhasil"
      // padahal barisnya masih ada.
      const line = await tx.bankStatementLine.findUnique({
        where: { id },
        select: { bankStatementId: true, date: true },
      });
      if (!line) throw new Error("Baris rekening koran tidak ditemukan");

      // R-12: kunci header sesudah baris, sebelum induk rekonsiliasi —
      // urutan lock global: baris -> header -> rekonsiliasi. Header harus
      // terkunci sebelum delete + recalc agar tidak balapan dengan penulis
      // baris lain pada header sama.
      await lockBankStatementHeaders(tx, [line.bankStatementId]);

      await assertPeriodOpen(line.date, tx);
      // Induk dikunci (terurut) lalu hubungan+status dibaca ulang — urutan
      // lock sama dengan update di atas agar tak deadlock dengan
      // match/complete.
      await lockReconParentsAndAssertNotCompleted(
        tx,
        id,
        "Baris yang sudah masuk rekonsiliasi selesai tidak dapat dihapus",
      );

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


type JournalEntryInput = {
  accountId: number;
  debit: number;
  credit: number;
  memo: string;
  costCenterId?: number;
  profitCenterId?: number;
};

/** Parse + validasi entri jurnal dari form (dipakai createJournal dan updateJournal, aturan identik). */
function parseAndValidateJournalEntries(formData: FormData) {
  const entriesJson = formData.get("entries") as string | null;
  const entries = safeJsonParse<JournalEntryInput[]>(entriesJson) ?? [];

  // Parser uang repo: Number("2.000.000,50") tak terbaca (NaN) dan Number("2.000.000")
  // bernilai 2 — nominal Indonesia dari klien non-form wajib lewat parseMoneyAmount.
  const parseEntryAmount = (value: unknown, side: "debit" | "credit"): number => {
    if (typeof value === "string") {
      if (!value.trim()) return 0;
      const parsed = parseMoneyAmount(value);
      if (parsed === null) throw new Error(`Nominal ${side} tidak valid`);
      return parsed;
    }
    return (value ?? 0) as number;
  };

  // Baris kosong penuh dari form (tanpa akun, nominal 0) dilewati; baris
  // setengah terisi WAJIB ditolak, bukan dibuang diam-diam — membuangnya
  // mengubah makna jurnal yang dikirim pemakai tanpa satu pun error.
  const validEntries: JournalEntryInput[] = [];
  for (const e of entries) {
    const debit = parseEntryAmount(e.debit, "debit");
    const credit = parseEntryAmount(e.credit, "credit");
    const isBlank = !e.accountId && !debit && !credit;
    if (isBlank) continue;
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      throw new Error("Nominal debit/credit tidak valid");
    }
    if (debit < 0 || credit < 0) {
      throw new Error("Nominal debit/credit tidak boleh negatif");
    }
    if (!e.accountId) {
      throw new Error("Akun wajib dipilih pada setiap baris jurnal bernominal");
    }
    if (debit > 0 && credit > 0) {
      throw new Error(
        "Satu baris tidak boleh memiliki debit dan credit sekaligus",
      );
    }
    if (debit === 0 && credit === 0) {
      throw new Error("Setiap baris jurnal wajib memiliki nominal debit atau kredit");
    }
    validEntries.push({ ...e, debit, credit });
  }
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

  return { validEntries, totalDebit, totalCredit };
}

/** Baris `journalEntry.createMany` untuk satu jurnal (dipakai create dan update). */
function journalEntryRows(journalId: number, validEntries: JournalEntryInput[]) {
  return validEntries.map((entry) => ({
    journalId,
    accountId: entry.accountId,
    debit: entry.debit || 0,
    credit: entry.credit || 0,
    memo: entry.memo || null,
    costCenterId: entry.costCenterId || null,
    // Pusat laba: tanpa baris ini laporan pusat laba selalu menumpuk di
    // "Tanpa Pusat Laba" walau masternya sudah ada.
    profitCenterId: entry.profitCenterId || null,
  }));
}

/** Kaitkan attachment pending ke jurnal dalam tx pemanggil (ISF-01). */
async function attachJournalAttachments(tx: TxClient, formData: FormData, journalId: number, userId: number) {
  const attachmentIds = formData.get("attachmentIds") as string | null;
  if (attachmentIds) {
    await attachPendingTransactionAttachments(tx, {
      attachmentIds, referenceType: "journal", referenceId: journalId, uploadedBy: userId,
    });
  }
}

/** Ekor sukses bersama create/update jurnal: log aktivitas + revalidate. */
async function finishJournalMutation(
  journal: { id: number },
  action: "create" | "update",
  logMessage: string,
): Promise<{ success: boolean; id: number; error?: undefined }> {
  await logActivity(action, "Journal", journal.id, logMessage);
  revalidatePath("/keuangan/jurnal");
  return { success: true, id: journal.id };
}

/** Hasil catch bersama create/update jurnal; redirect Next tetap diteruskan. */
function journalMutationError(e: unknown, tag: string): { success: boolean; id?: undefined; error: string } {
  if (isNextRedirectError(e)) throw e;
  console.error(tag, getErrorMessage(e) || e);
  return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
}

// ==================== JOURNAL ACTIONS ====================

export async function createJournal(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    // Tanggal wajib YYYY-MM-DD kalender-nyata (dateOnly) lalu WIB-midnight:
    // `new Date("2026-02-30")` geser diam-diam ke 2 Mar dan Invalid Date
    // lolos assertPeriodOpen (NaN <= lock = false).
    const parsedJournal = parseFormData(journalSchema, formData);
    if (!parsedJournal.success) return { success: false as const, error: parsedJournal.error };
    const txDate = wibDateToUtcMidnight(parsedJournal.data.transactionDate);

    const documentNo = await generateDocumentNumber("JRN");

    // Block posting/creating into a closed accounting period.
    // Cek luar-tx hanya fast-fail; keputusan final diulang di dalam tx
    // dengan tx di bawah (R-09) — tanpa itu tutup-periode bisa menyelip
    // di antara cek ini dan tulis jurnal.
    await assertPeriodOpen(txDate);

    // Laravel parity: parse and validate entries before creating journal
    const { validEntries, totalDebit, totalCredit } = parseAndValidateJournalEntries(formData);

    // Wrap header + entries in a single transaction to prevent orphan journals
    const journal = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(txDate, tx);
      const j = await tx.journal.create({
        data: {
          journalNumber: documentNo,
          slug: await nextSlug("journal", documentNo),
          transactionDate: txDate,
          description: parsedJournal.data.description ?? null,
          type: parsedJournal.data.type,
          status: "DRAFT",
          totalDebit,
          totalCredit,
          createdBy: Number(user.id),
        },
      });

      // Batch create all entries in one query (eliminates N+1)
      await tx.journalEntry.createMany({ data: journalEntryRows(j.id, validEntries) });

      // ISF-01: klaim lampiran dalam tx yang sama — gagal klaim rollback
      // header+entri, bukan jurnal yatim yang dilaporkan gagal ke pemanggil.
      await attachJournalAttachments(tx, formData, j.id, Number(user.id));

      return j;
    });

    // Route through approval workflow if one is configured for Journal.
    await requestApprovalIfConfigured("Journal", journal.id, Number(user.id));

    return finishJournalMutation(journal, "create", "Membuat jurnal");
  } catch (e: unknown) {
    return journalMutationError(e, "[createJournal]");
  }
}

export async function postJournal(journalId: number) {
  try {
    await requirePermission("post_journals");

    // F-01: baca awal hanya untuk validasi cepat (UX). Kebenaran
    // diputus di dalam transaksi terkunci di bawah — snapshot ini tak
    // boleh jadi dasar klaim status.
    const preview = await prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { entries: true },
    });

    if (preview.status !== "DRAFT") {
      throw new Error("Journal hanya bisa di-post dari status DRAFT");
    }

    // Workflow approval must be complete (no-op if no workflow configured).
    await assertApproved("Journal", journalId);

    // Block posting into a closed accounting period
    await assertPeriodOpen(preview.transactionDate);

    // Validate double-entry balance on preview (fast-fail before locking).
    const previewDebit = preview.entries.reduce(
      (sum, e) => safeAdd(sum, Number(e.debit), 2),
      0,
    );
    const previewCredit = preview.entries.reduce(
      (sum, e) => safeAdd(sum, Number(e.credit), 2),
      0,
    );

    if (!compareAmounts(previewDebit, previewCredit, 0)) {
      throw new Error(
        `Journal tidak balance: Debit ${previewDebit} vs Credit ${previewCredit}`,
      );
    }

    // F-01: lock baris jurnal, baca ulang status+entri, validasi ulang,
    // lalu klaim DRAFT→POSTED dalam transaksi yang sama. Edit bersamaan
    // (updateJournal) ikut antre di lock yang sama — hasil serial.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM journals WHERE id = ${journalId} FOR UPDATE`;

      const journal = await tx.journal.findUniqueOrThrow({
        where: { id: journalId },
        include: { entries: true },
      });
      if (journal.status !== "DRAFT") {
        throw new Error("Jurnal sudah diposting atau sedang diproses");
      }

      // R-09: baca lock-date dalam tx yang sama (tanpa tx, tutup periode bisa
      // selip di antara cek dan klaim).
      await assertPeriodOpen(journal.transactionDate, tx);

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

      const claim = await tx.journal.updateMany({
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
    });

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

    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    const parsed = parseFormData(expenseSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("EXP");

    // Akun bare-int tanpa FK: tolak ID basi sebelum tulis (fail-closed).
    for (const aid of [v.accountId, v.paidFromAccountId]) {
      if (aid != null) {
        const ok = await prisma.account.count({ where: { id: aid } });
        if (!ok) return { success: false, error: `Akun tidak ditemukan (id: ${aid}). Pilih ulang akun sebelum menyimpan.` };
      }
    }

    const attachmentIds = formData.get("attachmentIds") as string | null;
    const expense = await prisma.$transaction(async (tx) => {
      // P2 idempotency UI: guard dalam transaksi yang sama (pola createPettyCash).
      await checkIdempotency(idempotencyKey, tx, user.id);

      // F-2026-10-24-133-V Putusan 1(b)/3/4: penanda L3 pada description
      // menjadikan expense ini biaya telat NON-JOB sesudah WO closed —
      // akun wajib EXPS/OEXP (tolak COGS/INTR/WIP), alasan wajib, guard
      // duplikat, ActivityLog WO dalam tx sama.
      const l3 = await resolveL3WorkOrder(tx, v.description, "Pengeluaran");
      if (l3) {
        await assertExpenseL3AccountAllowed(tx, v.accountId);
        await assertNoDuplicateL3(tx, {
          workOrderId: l3.workOrder.id,
          workOrderNo: l3.workOrder.documentNo,
          vendorKey: `vendor:${v.vendorId ?? "-"}`,
          amount: Number(v.amount),
          date: wibDateToUtcMidnight(v.date),
        });
      }

      const created = await tx.expense.create({
      data: {
        // Jalur operasional tidak pernah menandai klaim (BR-RB-01):
        // klaim hanya lahir lewat aksi klaim reimbursement.
        isReimbursementClaim: false,
        documentNo,
        slug: await nextSlug("expense", documentNo),
        accountId: v.accountId,
        paidFromAccountId: v.paidFromAccountId ?? null,
        projectId: v.projectId ?? null,
        costCenterId: v.costCenterId ?? null,
        amount: v.amount,
        date: wibDateToUtcMidnight(v.date),
        referenceNo: v.referenceNo ?? null,
        description: v.description ?? null,
        categoryId: v.categoryId ?? null,
        vendorId: v.vendorId ?? null,
        receiptImage: v.receiptImage ?? null,
        status: "draft",
        createdBy: Number(user.id),
      },
      });
      // R-10: attach dalam tx utama yang sama — gagal attach = rollback expense,
      // tanpa baris expense yatim atau lampiran menggantung referenceId=0.
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "expense", referenceId: created.id, uploadedBy: Number(user.id),
        });
      }
      // Putusan 4(2): jejak L3 pada WO dalam tx yang sama dengan dokumen.
      if (l3) {
        await writeL3ActivityLog(tx, {
          workOrder: l3.workOrder,
          sourceType: "Expense",
          sourceId: created.id,
          sourceDocumentNo: created.documentNo,
          vendorKey: `vendor:${v.vendorId ?? "-"}`,
          amount: Number(v.amount),
          date: wibDateToUtcMidnight(v.date),
          reason: l3.tag.reason,
          userId: Number(user.id),
        });
      }
      return created;
    });

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

    // F-2026-10-25-017-S: gerbang khusus klaim reimbursement (non-klaim
    // nol perubahan). Bukti BR-RB-04 + SoD BR-RB-07 + nominal <= bukti.
    const isClaim = expense.isReimbursementClaim;
    if (isClaim) {
      const attachmentCount = await prisma.transactionAttachment.count({
        where: { referenceType: "expense", referenceId: expenseId },
      });
      const evidence = evaluateReimbursementEvidence({
        referenceNo: expense.referenceNo,
        receiptImage: expense.receiptImage,
        attachmentCount,
      });
      if (!evidence.ok) throw new Error(evidence.error);
      const amountGuard = evaluateReimbursementApprovedAmount({
        submittedAmount: Number(expense.amount),
        evidencedAmount: Number(expense.amount),
      });
      if (!amountGuard.ok) throw new Error(amountGuard.error);
      const approverEmployee = await prisma.employee.findFirst({
        where: { userId: Number(user.id) },
        select: { id: true },
      });
      const sod = evaluateReimbursementApprovalSod({
        claimantEmployeeId: expense.employeeId,
        approverEmployeeId: approverEmployee?.id ?? null,
      });
      if (!sod.ok) throw new Error(sod.error);
    }

    // Sync to PettyCash (idempotent on documentNo), THEN flip to approved.
    // Ordering matters: if the petty-cash sync fails, the expense keeps its
    // pre-approval status and the whole approveExpense is retryable. The sync is
    // idempotent on documentNo, so a retry after a partial failure will not
    // double-create the petty cash record.
    await onExpenseApprovedSyncPettyCash(expenseId, Number(user.id));

    // Guarded write: only flip when the row is still in a pre-approval state,
    // so a concurrent approver cannot double-apply the status change.
    if (isClaim) {
      // J-RB1 + flip status dalam SATU tx: akrual gagal (setting 210209
      // kosong/periode tutup) = klaim tetap draft, bukan setengah berjurnal.
      await prisma.$transaction(async (tx) => {
        await onReimbursementClaimApproved(expenseId, Number(user.id), tx);
        const claimTx = await tx.expense.updateMany({
          where: { id: expenseId, status: { in: ["draft", "approved"] } },
          data: { status: "approved", approvedBy: Number(user.id) },
        });
        if (claimTx.count === 0) {
          throw new Error("Pengeluaran sudah diproses atau status tidak valid");
        }
      });
    } else {
      const claim = await prisma.expense.updateMany({
        where: { id: expenseId, status: { in: ["draft", "approved"] } },
        data: { status: "approved", approvedBy: Number(user.id) },
      });
      if (claim.count === 0) {
        throw new Error("Pengeluaran sudah diproses atau status tidak valid");
      }
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
    const user = await requirePermission("approve_expenses");

    // Race guard: lock expense FOR UPDATE + recheck status + post journal +
    // flip paid dalam SATU tx. Baca luar-tx dihapus: dua klik bayar bersamaan
    // bisa sama-sama lolos cek approved lalu jurnal ganda / flip ganda.
    // paidFromAccountId dicek ulang dalam tx setelah lock — pesaing bisa
    // mengosongkannya di antara baca luar dan tulis.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM expenses WHERE id = ${expenseId} FOR UPDATE`;

      const locked = await tx.expense.findUniqueOrThrow({
        where: { id: expenseId },
      });

      // Laravel parity: only approved expenses can be marked as paid (draft → approved → paid)
      if (locked.status !== "approved") {
        throw new Error(
          "Hanya pengeluaran yang sudah disetujui yang dapat ditandai sebagai dibayar",
        );
      }

      // Refuse to settle an expense that has no source of funds. `onExpenseApproved`
      // cannot post Dr. Beban / Cr. Kas-Bank without `paidFromAccountId`, and the old
      // silent early-return there flipped the expense to "paid" anyway — cash out with
      // zero GL trace. Reject it here (status untouched, retryable after the account is
      // filled in) instead of banking on that hook never staying silent again.
      if (!locked.paidFromAccountId) {
        throw new Error(
          "Pengeluaran belum punya akun sumber dana (kas/bank). Isi akun sumber dana sebelum menandai lunas — tanpa itu tidak ada jurnal yang bisa diposting.",
        );
      }

      // F-2026-10-24-133-V Putusan 1(b): expense bertanda L3 yang akunnya
      // diganti sesudah create wajib lolos penjaga tipe lagi di titik
      // jurnal — akun COGS/INTR/WIP ditolak sebelum jurnal lahir.
      const l3Paid = parseL3Tag(locked.description);
      if (l3Paid) {
        await resolveL3WorkOrder(tx, locked.description, "Pengeluaran");
        await assertExpenseL3AccountAllowed(tx, locked.accountId);
      }

      // Post the accounting journal FIRST inside the same tx (Laravel parity: GL
      // created when paid). Posting before the status flip means a journal
      // failure (e.g. closed period) leaves the expense at "approved" and
      // retryable, instead of stranding it as "paid" with no GL entry. The
      // journal's (referenceType, referenceId) unique constraint already
      // prevents any double-post on concurrent calls — the tx-scoped hook call
      // (executeInTx reuses this tx) keeps check-then-create serial under the
      // expense row lock.
      // Klaim reimbursement: J-RB2 (Dr 210209/Cr Kas) MENGGANTIKAN jurnal
      // existing — klaim tidak boleh juga memposting Dr Beban/Cr Kas
      // (vonis 018-V Putusan 2, E-RB5-2). Bayar sebagian tidak didukung
      // API bayar existing (tanpa nominal) — tahap ini bayar penuh saja;
      // penjaga nominal menjaga kontrak itu eksplisit.
      if (locked.isReimbursementClaim) {
        // Hanya J-RB1 AKTIF (bukan REVERSED, belum terhapus) sah sebagai dasar bayar (Putusan 2).
        const accruedJournal = await tx.journal.findFirst({
          where: {
            referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
            referenceId: expenseId,
            status: { not: "REVERSED" },
            deletedAt: null,
          },
          select: { totalDebit: true },
        });
        if (!accruedJournal) {
          throw new Error(
            "Klaim belum punya jurnal akrual J-RB1 — bayar ditolak. Setujui klaim lebih dulu.",
          );
        }
        const payGuard = evaluateReimbursementPaymentAmount({
          accruedAmount: Number(accruedJournal.totalDebit),
          paymentAmount: Number(locked.amount),
        });
        if (!payGuard.ok) throw new Error(payGuard.error);
        await onReimbursementClaimPaid(expenseId, Number(user.id), tx);
      } else {
        await onExpenseApproved(expenseId, Number(user.id), tx);
      }

      // Conditional claim: only flip when still approved. The FOR UPDATE lock
      // serializes this block, so count===0 means the status moved under us
      // (reject/cancel path) — surface as processed error, never silently
      // succeed.
      const claim = await tx.expense.updateMany({
        where: { id: expenseId, status: "approved" },
        data: { status: "paid" },
      });
      if (claim.count === 0) {
        throw new Error("Pengeluaran sudah diproses atau status tidak valid");
      }
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

    // IN: cek saldo sumber dana (kas/bank) dilakukan DI DALAM transaksi utama
    // di bawah (AUD-02) — cek di sini membaca snapshot sebelum transaksi dan
    // bisa dilalui dua request paralel yang sama-sama lolos.

    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    // Akun bare-int tanpa FK (PettyCash.accountId): tolak ID basi (fail-closed).
    if (v.accountId != null) {
      const ok = await prisma.account.count({ where: { id: v.accountId } });
      if (!ok) return { success: false, error: `Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.` };
    }

    const pettyCash = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id);

      // Race guard: gap-lock tabel kas kecil SELAMA hitung saldo ekor.
      // Tanpa ini dua create bersamaan baca balanceBefore sama lalu keduanya
      // tulis — rantai/recalc sesudahnya menimpa salah satu, saldo akhir salah.
      await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`;

      // AUD-02: serialisasi menurut akun sumber. Kunci baris akun kas/bank
      // lalu hitung saldonya dari jurnal POSTED di dalam transaksi ini, agar
      // dua IN paralel tidak sama-sama lolos dari saldo sumber yang sama.
      if (type === "IN" && settings.cashBankAccountId) {
        const sourceId = settings.cashBankAccountId;
        await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${sourceId} FOR UPDATE`;
        const sourceEntries = await tx.journalEntry.findMany({
          where: { accountId: sourceId, journal: { status: "POSTED" } },
        });
        const sourceBalance = sourceEntries.reduce(
          (s, e) => safeSubtract(safeAdd(s, Number(e.debit), 2), Number(e.credit), 2),
          0,
        );
        if (sourceBalance < amount) {
          throw new Error(
            `Saldo akun Kas/Bank tidak mencukupi: tersedia ${sourceBalance.toLocaleString("id-ID")}, dibutuhkan ${amount.toLocaleString("id-ID")}`,
          );
        }
      }

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
          ? safeAdd(balanceBefore, amount, 2)
          : safeSubtract(balanceBefore, amount, 2);

      const created = await tx.pettyCash.create({
        data: {
          documentNo,
          slug: await nextSlug("pettyCash", documentNo),
          type,
          amount,
          balanceBefore,
          balanceAfter,
          date: wibDateToUtcMidnight(v.date),
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
      // R-10: attach dalam tx utama yang sama — gagal attach = rollback
      // petty-cash + jurnalnya, tanpa baris yatim atau lampiran menggantung.
      const attachmentIds = v.attachmentIds as string | undefined;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "petty_cash", referenceId: created.id, uploadedBy: Number(user.id),
        });
      }
      return created;
    });

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
        statementDate: wibDateToUtcMidnight(v.statementDate),
        statementBalance: v.statementBalance,
        periodStart: v.periodStart ? wibDateToUtcMidnight(v.periodStart) : null,
        periodEnd: v.periodEnd ? wibDateToUtcMidnight(v.periodEnd) : null,
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
    await requirePermission("manage_bank_reconciliation");

    // Semua ID datang dari klien (Server Action tetap bisa dipanggil langsung),
    // jadi hubungan akun/periode/jurnal wajib diperiksa di sini, bukan dipercaya
    // dari pilihan UI.
    await prisma.$transaction(async (tx) => {
      // R-04 + F-02: kunci BARIS dulu, baru induk — urutan lock konsisten di
      // semua jalur (match/unmatch/adjustment/complete/update/delete) agar
      // tak deadlock. Tanpa lock baris, update/delete bersamaan bisa selip
      // di antara baca line dan tulis item (TOCTOU).
      await tx.$executeRaw`SELECT id FROM bank_statement_lines WHERE id = ${lineId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM bank_reconciliations WHERE id = ${reconciliationId} FOR UPDATE`;

      const recon = await tx.bankReconciliation.findUniqueOrThrow({
        where: { id: reconciliationId },
        select: { status: true, accountId: true, periodStart: true, periodEnd: true },
      });
      if (recon.status !== "draft") {
        throw new Error("Hanya rekonsiliasi dengan status draft yang dapat dicocokkan");
      }

      // Hubungan+status dibaca ulang sesudah lock: baris bisa dipindah/dihapus
      // pesaing tepat sebelum match mengunci induk.
      const line = await tx.bankStatementLine.findUniqueOrThrow({
        where: { id: lineId },
        select: {
          date: true,
          amount: true,
          type: true,
          debit: true,
          credit: true,
          bankStatement: { select: { accountId: true } },
        },
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
          debit: true,
          credit: true,
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

      // R-03: nominal + arah wajib cocok. Tanpa ini, baris Rp100 ribu bisa
      // "dicocokkan" dengan jurnal Rp1 (match palsu menutup selisih).
      // Toleransi 0.01 untuk sisa pembulatan Decimal(15,2).
      const lineAmount = Number(line.amount);
      const entryDebit = Number(journalEntry.debit);
      const entryCredit = Number(journalEntry.credit);
      const entryHasDebit = entryDebit > 0;
      const entryHasCredit = entryCredit > 0;
      if (entryHasDebit === entryHasCredit) {
        throw new Error("Entri jurnal tidak memiliki arah debit/kredit yang jelas");
      }
      const entryAmount = entryHasDebit ? entryDebit : entryCredit;
      // Epsilon 1e-9 lawan noise biner float (1000.01-1000 = 0.0099999...).
      if (Math.abs(lineAmount - entryAmount) >= 0.01 - 1e-9) {
        throw new Error(
          `Nominal tidak sama: baris rekening koran ${lineAmount} vs entri jurnal ${entryAmount}`,
        );
      }
      // Arah: kolom debit = kas masuk (lihat createBankStatementLine),
      // sama seperti sisi debit akun bank di jurnal. Debit lawan kredit
      // berarti arus berlawanan — tolak.
      const lineIsDebit = Number(line.debit) > 0 || line.type === "debit";
      if (lineIsDebit !== entryHasDebit) {
        throw new Error("Arah tidak sama: baris debit hanya dapat cocok dengan entri debit (dan sebaliknya)");
      }

      // R-03: satu entri jurnal hanya boleh dipakai sekali per rekonsiliasi.
      // Tanpa ini, satu jurnal Rp1 jt bisa "menutup" banyak baris sekaligus.
      // findFirst dikecualikan baris ini sendiri agar match ulang yang sama
      // tetap idempoten; UNIQUE(bank_reconciliation_id, journal_entry_id)
      // menutup balapan antar-transaksi (P2002 di bawah).
      const journalReuse = await tx.bankReconciliationItem.findFirst({
        where: {
          bankReconciliationId: reconciliationId,
          journalEntryId,
          NOT: { bankStatementLineId: lineId },
        },
        select: { id: true },
      });
      if (journalReuse) {
        throw new Error("Entri jurnal sudah dipakai di rekonsiliasi ini");
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
    // R-03: balapan dua match jurnal-sama lolos cek findFirst lalu tabrakan
    // di UNIQUE(bank_reconciliation_id, journal_entry_id) — pesan ramah.
    if ((e as { code?: string })?.code === "P2002") {
      return { success: false, error: "Entri jurnal sudah dipakai di rekonsiliasi ini" };
    }
    console.error("[matchReconciliationLine]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createReconciliationAdjustment(
  reconciliationId: number,
  formData: FormData,
) {
  try {
    await requirePermission("manage_bank_reconciliation");

    const rawType = String(formData.get("type") ?? "").trim();
    if (rawType !== "outstanding_deposit" && rawType !== "outstanding_check") {
      return {
        success: false as const,
        error: "Jenis penyesuaian harus setoran beredar atau cek beredar",
      };
    }

    const amount = parseMoneyAmount(formData.get("amount"));
    if (amount === null || !(amount > 0)) {
      return {
        success: false as const,
        error: "Nominal penyesuaian harus lebih dari 0",
      };
    }

    const rawDate = String(formData.get("date") ?? "").trim();
    // Regex saja meloloskan tanggal fiktif (2026-02-30 -> 2 Mar via Date);
    // dateOnly refine kalender menangkapnya.
    if (!dateOnly.safeParse(rawDate).success) {
      return { success: false as const, error: "Tanggal penyesuaian tidak valid" };
    }

    const description = String(formData.get("description") ?? "").trim() || null;

    // F-02: cek draft + tulis item dalam SATU transaksi terkunci agar
    // tak selip di antara baca complete dan klaim completed.
    const item = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bank_reconciliations WHERE id = ${reconciliationId} FOR UPDATE`;

      const recon = await tx.bankReconciliation.findUniqueOrThrow({
        where: { id: reconciliationId },
        select: { status: true },
      });
      if (recon.status !== "draft") {
        throw new Error("Hanya rekonsiliasi dengan status draft yang dapat ditambah penyesuaian");
      }

      return tx.bankReconciliationItem.create({
        data: {
          bankReconciliationId: reconciliationId,
          bankStatementLineId: null,
          journalEntryId: null,
          type: rawType,
          amount,
          date: wibDateToUtcMidnight(rawDate),
          description,
          cleared: false,
          matched: false,
        },
      });
    });

    await logActivity(
      "create",
      "BankReconciliation",
      reconciliationId,
      "Menambah item penyesuaian rekonsiliasi bank",
    );
    revalidatePath("/keuangan/rekonsiliasi-bank");
    return { success: true as const, id: item.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createReconciliationAdjustment]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function unmatchReconciliationLine(
  reconciliationId: number,
  itemId: number,
) {
  try {
    await requirePermission("manage_bank_reconciliation");

    await prisma.$transaction(async (tx) => {
      // F-02: kunci induk dulu — urutan lock konsisten dengan match/complete.
      await tx.$executeRaw`SELECT id FROM bank_reconciliations WHERE id = ${reconciliationId} FOR UPDATE`;

      const recon = await tx.bankReconciliation.findUniqueOrThrow({
        where: { id: reconciliationId },
        select: { status: true },
      });
      if (recon.status !== "draft") {
        throw new Error("Hanya rekonsiliasi dengan status draft yang dapat dibatalkan cocoknya");
      }

      const item = await tx.bankReconciliationItem.findUniqueOrThrow({
        where: { id: itemId },
        select: { bankReconciliationId: true },
      });
      if (item.bankReconciliationId !== reconciliationId) {
        throw new Error("Item bukan milik rekonsiliasi ini");
      }

      await tx.bankReconciliationItem.delete({ where: { id: itemId } });
    });

    await logActivity(
      "unmatch",
      "BankReconciliation",
      reconciliationId,
      "Membatalkan kecocokan baris rekonsiliasi bank",
    );
    revalidatePath("/keuangan/rekonsiliasi-bank");
    return { success: true as const };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[unmatchReconciliationLine]", getErrorMessage(e) || e);
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function completeReconciliation(reconciliationId: number) {
  try {
    await requirePermission("manage_bank_reconciliation");

    // F-02: seluruh baca-validasi-tulis dalam SATU transaksi terkunci.
    // Baris induk dikunci dulu agar match/unmatch/adjustment bersamaan
    // antre di lock yang sama — complete selalu hitung dari data terbaru.
    const figures = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bank_reconciliations WHERE id = ${reconciliationId} FOR UPDATE`;

      // Laravel parity: only draft reconciliations can be completed
      const reconciliation = await tx.bankReconciliation.findUniqueOrThrow({
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

      // R-01: gate matched hanya untuk item pencocokan (punya
      // bankStatementLineId/journalEntryId). Item penyesuaian (keduanya null)
      // tidak perlu matched — wajib cleared:false + amount>0.
      const unmatchedMatchItems = reconciliation.items.filter(
        (item) =>
          (item.bankStatementLineId != null || item.journalEntryId != null) &&
          !item.matched,
      );
      if (unmatchedMatchItems.length > 0) {
        throw new Error(
          `${unmatchedMatchItems.length} baris belum di-match. Semua baris harus di-match sebelum menyelesaikan rekonsiliasi.`,
        );
      }
      const invalidAdjustments = reconciliation.items.filter(
        (item) =>
          item.bankStatementLineId == null &&
          item.journalEntryId == null &&
          (item.cleared || !(Number(item.amount) > 0)),
      );
      if (invalidAdjustments.length > 0) {
        throw new Error(
          `${invalidAdjustments.length} item penyesuaian tidak valid. Penyesuaian wajib belum cleared dan nominal lebih dari 0.`,
        );
      }

      // Numeric balance gate — standar rekonsiliasi bank (sisi bank disesuaikan):
      //   adjusted_bank = statement_balance + outstanding_deposits − outstanding_payments
      //   difference    = adjusted_bank − book_balance
      // Block completion unless |difference| < 0.01. Kolom `adjustedBookBalance`
      // SUDAH ADA dan dipakai laporan — nama dipertahankan (warisan = adjusted
      // bank balance), diisi nilai sisi-bank yang benar.
      const outstandingDeposits = reconciliation.items
        .filter((i) => !i.cleared && i.type === "outstanding_deposit")
        .reduce((s, i) => safeAdd(s, Number(i.amount), 2), 0);
      const outstandingPayments = reconciliation.items
        .filter((i) => !i.cleared && i.type === "outstanding_check")
        .reduce((s, i) => safeAdd(s, Number(i.amount), 2), 0);
      const adjustedBookBalance = safeSubtract(
        safeAdd(Number(reconciliation.statementBalance), outstandingDeposits, 2),
        outstandingPayments,
        2,
      );
      const difference = safeSubtract(
        adjustedBookBalance,
        Number(reconciliation.bookBalance),
        2,
      );
      if (Math.abs(difference) >= 0.01) {
        throw new Error(
          `Rekonsiliasi belum seimbang. Selisih: ${difference.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
            `Tambahkan item penyesuaian (setoran/cek beredar) atau periksa saldo sebelum menyelesaikan.`,
        );
      }

      // Klaim bersyarat draft→completed di dalam transaksi yang sama:
      // complete ganda serentak hanya satu yang menang.
      const claim = await tx.bankReconciliation.updateMany({
        where: { id: reconciliationId, status: "draft" },
        data: {
          status: "completed",
          completedAt: new Date(),
          outstandingDeposits,
          outstandingPayments,
          adjustedBookBalance,
          difference,
        },
      });
      if (claim.count === 0) {
        throw new Error("Rekonsiliasi sudah diselesaikan atau sedang diproses");
      }

      return { outstandingDeposits, outstandingPayments, adjustedBookBalance, difference };
    });

    await logActivity(
      "complete",
      "BankReconciliation",
      reconciliationId,
      `Menyelesaikan rekonsiliasi bank (selisih ${figures.difference})`,
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

/**
 * Hasil catch bersama create/update pusat laba; redirect Next tetap diteruskan.
 * `code` unik di skema: kegagalan paling sering adalah kode terpakai.
 * Cek error mentah (code/pesan asli) sebelum sanitasi: pesan yang sudah
 * disanitasi tidak lagi mengandung detail teknis seperti "Unique constraint".
 */
function profitCenterDuplicateError(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e;
  const raw = e instanceof Error ? e.message : "";
  if ((e as { code?: unknown })?.code === "P2002" || raw.includes("Unique constraint") || raw.includes("1062")) {
    return { success: false as const, error: "Kode pusat laba sudah digunakan" };
  }
  const message = getErrorMessage(e) || "";
  console.error(tag, message || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

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
    return profitCenterDuplicateError(e, "[createProfitCenter]");
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
    return profitCenterDuplicateError(e, "[updateProfitCenter]");
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
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: { journalId: id } });
      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "Journal", referenceId: id,
      });
      await tx.journal.delete({ where: { id } });
    });
    await removeAttachmentFiles(removedFiles);

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
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "Expense", referenceId: id,
      });
      await tx.expense.delete({ where: { id } });
      await tx.approval.deleteMany({
        where: { referenceType: "Expense", referenceId: id },
      });
    });
    await removeAttachmentFiles(removedFiles);

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

    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      // Race guard: gap-lock tabel + kunci baris target SELAMA hapus.
      // Tanpa ini create/edit bersamaan baca chain pra-hapus lalu tulis
      // setelah delete commit — saldo rantai dihitung dari data basi.
      await tx.$executeRaw`SELECT id FROM petty_cash WHERE id = ${id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`;

      // Remove the linked journal (avoid orphaned GL entries), delete the record,
      // then recompute the running balance for all remaining records.
      await deletePettyCashJournal(tx, id);
      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "PettyCash", referenceId: id,
      });
      await tx.pettyCash.delete({ where: { id } });
      await recalcPettyCashChain(tx, { guardNegative: true });
    });
    await removeAttachmentFiles(removedFiles);

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

    // Block editing into a closed accounting period (both old and new dates).
    // Tanggal BARU divalidasi formatnya dulu: string tak-terparse (mis.
    // "bukan-tanggal") harus DITOLAK berisik, bukan lolos sebagai Invalid
    // Date ke assertPeriodOpen/tulis.
    await assertPeriodOpen(existing.transactionDate);
    const parsedUpdate = parseFormData(updateJournalSchema, formData);
    if (!parsedUpdate.success) return { success: false as const, error: parsedUpdate.error };
    const newTxDate = wibDateToUtcMidnight(parsedUpdate.data.transactionDate);
    await assertPeriodOpen(newTxDate);

    // Parse and validate entries with the same rigor as createJournal —
    // previously the edit path ignored line entries entirely, so edited lines
    // were silently discarded and the balance invariant was never re-checked.
    const { validEntries, totalDebit, totalCredit } = parseAndValidateJournalEntries(formData);

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
      // F-01: lock baris jurnal dulu — protokol sama dengan postJournal.
      // Cek DRAFT di luar hanya fast-fail; keputusan final ada di sini,
      // sesudah lock, agar edit-vs-posting serial.
      await tx.$executeRaw`SELECT id FROM journals WHERE id = ${id} FOR UPDATE`;

      const fresh = await tx.journal.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== "DRAFT") {
        throw new Error("Journal yang sudah diposting tidak dapat diubah");
      }

      // R-09: kedua tanggal dicek ulang dalam tx sesudah lock (tanpa tx,
      // tutup periode bisa selip di antara cek luar dan tulis). Cek luar-tx
      // di atas hanya fast-fail agar boros lock terhindar. newTxDate adalah
      // tanggal yang SUDAH tervalidasi di atas (bukan parse mentah).
      await assertPeriodOpen(fresh.transactionDate, tx);
      await assertPeriodOpen(newTxDate, tx);

      const j = await tx.journal.update({
        where: { id },
        data: {
          transactionDate: newTxDate,
          description: parsedUpdate.data.description ?? null,
          type: journalType,
          totalDebit,
          totalCredit,
          slug: await nextSlug("journal", existing.journalNumber, { excludeId: id }),
        },
      });

      await tx.journalEntry.deleteMany({ where: { journalId: id } });
      // Pusat laba ikut tersimpan saat entri diganti (journalEntryRows), kalau
      // tidak mengubah jurnal akan menghapus pusat labanya.
      await tx.journalEntry.createMany({ data: journalEntryRows(id, validEntries) });

      // ISF-01: klaim lampiran dalam tx yang sama — gagal klaim rollback
      // header+entri, bukan perubahan commit yang dilaporkan gagal.
      await attachJournalAttachments(tx, formData, id, Number(user.id));

      return j;
    });

    // Edit membuka kembali pengajuan bila approval sebelumnya ditolak
    // (resubmit); tanpa workflow terkonfigurasi ini no-op.
    await requestApprovalIfConfigured("Journal", id, Number(user.id));

    return finishJournalMutation(journal, "update", "Memperbarui jurnal");
  } catch (e: unknown) {
    return journalMutationError(e, "[updateJournal]");
  }
}

export async function reverseJournal(journalId: number) {
  try {
    const user = await requirePermission("post_journals");

    // Race guard: klaim atomik POSTED->REVERSING + reversal + REVERSED dalam
    // SATU tx. Klaim luar-tx dihapus: dua reverse bersamaan + crash di antara
    // klaim dan tx bisa tinggalkan REVERSING basi / reversal ganda.
    // Baris dikunci dulu (FOR UPDATE), status dibaca ulang dalam tx: baca
    // luar-tx dihapus — status bisa berubah di antara baca dan lock.
    // Period check + alokasi nomor + reversal semua dalam tx yang sama: gagal
    // di tengah = rollback penuh, jurnal kembali POSTED dan retryable.
    // (Cleanup cron taskRecoverStuckReversals tetap ada sebagai sabuk kedua
    // bila proses mati di tengah commit.)
    let documentNo: string;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM journals WHERE id = ${journalId} FOR UPDATE`;

      const journal = await tx.journal.findUniqueOrThrow({
        where: { id: journalId },
        include: { entries: true },
      });

      // Laravel parity: only posted journals can be reversed
      if (journal.status !== "POSTED") {
        const current = journal.status;
        throw new Error(
          current === "REVERSED"
            ? "Jurnal sudah pernah dibalik"
            : `Jurnal tidak bisa dibalik (status: ${current})`,
        );
      }

      // TASK-025: jurnal lawan reversal tidak boleh di-reverse lagi lewat
      // jalur generik — lihat REVERSAL_JOURNAL_REVERSAL_ERROR.
      if (journal.referenceType === "Journal") {
        throw new Error(REVERSAL_JOURNAL_REVERSAL_ERROR);
      }

      // F-121-V Putusan 3: jurnal penutup tahun tidak boleh lewat jalur
      // generik ini (izin post_journals, tanpa gerbang penutup) — arahkan ke
      // reverseYearEndClosing (manage_settings + approval penutup).
      if (journal.referenceType === YEAR_END_CLOSING_REFERENCE_TYPE) {
        throw new Error(YEAR_END_CLOSING_GENERIC_REVERSAL_ERROR);
      }

      // Atomic conditional claim — serialize concurrent reverse requests so only one
      // reversal journal is created; duplicates get a clean error instead of
      // corrupting the GL with two reversals. Runs INSIDE the same tx after the
      // lock + reread: the claim and the reversal commit atomically, so a crash
      // can never leave REVERSING without a reversal row.
      const claim = await tx.journal.updateMany({
        where: { id: journalId, status: "POSTED" },
        data: { status: "REVERSING" },
      });
      if (claim.count === 0) {
        throw new Error("Jurnal tidak bisa dibalik (konflik konkurensi — coba lagi)");
      }

      // Cannot reverse a journal that belongs to a closed period
      await assertPeriodOpen(journal.transactionDate, tx);

      documentNo = await generateDocumentNumber("JRN-RV");

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

    // Akun bare-int tanpa FK: tolak ID basi sebelum tulis (fail-closed).
    for (const aid of [v.accountId, v.paidFromAccountId]) {
      if (aid != null) {
        const ok = await prisma.account.count({ where: { id: aid } });
        if (!ok) throw new Error(`Akun tidak ditemukan (id: ${aid}). Pilih ulang akun sebelum menyimpan.`);
      }
    }

    // ISF-01 sekelas: update + klaim lampiran dalam SATU tx. Dulu update
    // berjalan tanpa tx lalu klaim di tx terpisah — klaim gagal = perubahan
    // sudah commit tapi action menjawab gagal.
    const expense = await prisma.$transaction(async (tx) => {
      // F-133-V: edit draft bertanda L3 mengulang penjaga yang sama
      // (akun/WO closed/alasan/duplikat selain dirinya) sebelum tulis.
      const l3 = await resolveL3WorkOrder(tx, v.description, "Pengeluaran");
      if (l3) {
        await assertExpenseL3AccountAllowed(tx, v.accountId);
        await assertNoDuplicateL3(tx, {
          workOrderId: l3.workOrder.id,
          workOrderNo: l3.workOrder.documentNo,
          vendorKey: `vendor:${v.vendorId ?? "-"}`,
          amount: Number(v.amount),
          date: wibDateToUtcMidnight(v.date),
          excludeSource: { sourceType: "Expense", sourceId: id },
        });
      }
      const updated = await tx.expense.update({
        where: { id },
        data: {
          accountId: v.accountId,
          paidFromAccountId: v.paidFromAccountId ?? null,
          projectId: v.projectId ?? null,
          costCenterId: v.costCenterId ?? null,
          amount: v.amount,
          date: wibDateToUtcMidnight(v.date),
          referenceNo: v.referenceNo ?? null,
          description: v.description ?? null,
          categoryId: v.categoryId ?? null,
          vendorId: v.vendorId ?? null,
          receiptImage: v.receiptImage ?? null,
          status: "draft",
          slug: await nextSlug("expense", existingExpense.documentNo, { excludeId: id }),
        },
      });
      const attachmentIds = v.attachmentIds as string | undefined;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "expense", referenceId: updated.id, uploadedBy: Number(user.id),
        });
      }
      return updated;
    });

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

    // Akun bare-int tanpa FK (PettyCash.accountId): tolak ID basi (fail-closed).
    if (v.accountId != null) {
      const ok = await prisma.account.count({ where: { id: v.accountId } });
      if (!ok) throw new Error(`Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.`);
    }

    const pettyCash = await prisma.$transaction(async (tx) => {
      // Race guard: kunci baris yang diedit + gap-lock tabel SELAMA baca rantai.
      // Tanpa ini dua edit bersamaan baca chain sama lalu tulis bergantian —
      // recalc kedua menimpa hasil pertama, saldo akhir salah. Lock baris dulu
      // (butuh bila tx pesaing update/delete id sama: satu antre, bukan deadlock
      // — urutan sama di semua jalur), lalu kunci tabel untuk baca konsisten.
      await tx.$executeRaw`SELECT id FROM petty_cash WHERE id = ${id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`;

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
          date: wibDateToUtcMidnight(v.date),
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

      // ISF-01 sekelas: klaim lampiran dalam tx yang sama (dulu tx terpisah
      // sesudah commit — klaim gagal = perubahan commit dilaporkan gagal).
      const attachmentIds = v.attachmentIds as string | undefined;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "petty_cash", referenceId: updated.id, uploadedBy: Number(user.id),
        });
      }
      return updated;
    });

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

