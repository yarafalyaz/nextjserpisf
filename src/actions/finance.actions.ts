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
  assertAccountsExist,
  reverseJournalsByReferenceTx,
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
import { nextSlug, nextSlugWithClient } from "@/lib/utils/slug-db";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { parseBankStatementCsv } from "@/lib/finance/bank-statement-csv";
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
    const idempotencyKey = formData.get("idempotencyKey") as string | null;
    const bankStatement = await prisma.$transaction(async (tx) => {
      const stmtDate = wibDateToUtcMidnight(v.date);
      await assertPeriodOpen(stmtDate, tx);
      // Putaran 65: retry submit identik melahirkan header draft kembar
      // (slug hanya suffix; tanpa jaring unik bisnis). Klaim sesudah kunci
      // periode, mengikuti urutan baris/penyesuaian/head...
      await checkIdempotency(idempotencyKey, tx, user.id);
      // accountId/bankId bare-int tanpa FK: header lahir untuk akun
      // nonaset/mati atau bank fiktif lalu seluruh rantai koran/rekon
      // yatim. Picker menawarkan isActive + type ASSET dan bank aktif;
      // gerbang dalam tx menyamakan kontrak itu (pola dokumen bebas).
      const liveAccount = await tx.account.findFirst({
        where: { id: v.accountId, isActive: true, deletedAt: null, type: "ASSET" },
        select: { id: true },
      });
      if (!liveAccount) {
        throw new Error("Akun rekening koran tidak ditemukan, tidak aktif atau bukan akun aset");
      }
      if (v.bankId != null) {
        const liveBank = await tx.bank.findFirst({
          where: { id: v.bankId, isActive: true },
          select: { id: true },
        });
        if (!liveBank) throw new Error("Bank tidak ditemukan atau tidak aktif");
      }
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
    const user = await requirePermission("create_journals");

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
      // Putaran 63: retry identik melahirkan baris mutasi hantu yang
      // mengubah total header dan memblokir penyelesaian rekonsiliasi.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id);
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

/**
 * Import baris rekening koran dari CSV. Atomik: satu baris rusak menolak
 * SELURUH import dan daftar error per nomor baris dikembalikan ke form —
 * tidak ada baris yang tertulis separuh dan tidak ada baris rusak yang
 * dibuang senyap. Header wajib draft (baris tidak ditambahkan ke rekening
 * koran yang sudah difinalkan) dan setiap tanggal baris wajib lolos
 * `assertPeriodOpen` di dalam transaksi yang sama, sesudah kunci header.
 */
export async function importBankStatementLines(formData: FormData) {
  try {
    const user = await requirePermission("create_journals");

    const bankStatementId = Number(formData.get("bankStatementId"));
    const fileEntry = formData.get("file");
    const csvTextRaw = formData.get("csvText");
    if (!Number.isInteger(bankStatementId) || bankStatementId <= 0)
      return { success: false as const, error: "bankStatementId tidak valid" };

    let csvText: string;
    if (fileEntry instanceof File && fileEntry.size > 0) {
      // ponytail: 1 MB / 5000 baris cukup untuk rekening koran bulanan;
      // naikkan bila ada berkas bank yang sah lebih besar.
      if (fileEntry.size > 1_000_000)
        return { success: false as const, error: "Berkas CSV melebihi 1 MB" };
      csvText = await fileEntry.text();
    } else if (typeof csvTextRaw === "string" && csvTextRaw.trim() !== "") {
      csvText = csvTextRaw;
    } else {
      return { success: false as const, error: "Pilih berkas CSV atau tempel isi CSV terlebih dahulu" };
    }

    const parsed = parseBankStatementCsv(csvText);
    if (parsed.errors.length > 0)
      return {
        success: false as const,
        error: `Import ditolak: ${parsed.errors.length} baris bermasalah, tidak ada baris yang ditulis. Perbaiki berkas lalu coba lagi.`,
        rowErrors: parsed.errors,
      };
    if (parsed.lines.length === 0)
      return { success: false as const, error: "Tidak ada baris data pada CSV" };
    if (parsed.lines.length > 5000)
      return { success: false as const, error: "Maksimal 5000 baris per import" };

    const imported = await prisma.$transaction(async (tx) => {
      await lockBankStatementHeaders(tx, [bankStatementId]);
      const header = await tx.bankStatement.findUnique({
        where: { id: bankStatementId },
        select: { status: true, deletedAt: true },
      });
      if (!header || header.deletedAt)
        throw new Error("Rekening koran tidak ditemukan");
      if (header.status !== "draft")
        throw new Error("Import hanya untuk rekening koran berstatus draft");

      // Putaran 65: retry submit identik mengimpor ulang seluruh berkas —
      // baris koran duplikat mengembungkan total header. Konten identik
      // antar berkas berbeda tetap sah, jadi penjaga = key per intent
      // impor, bukan dedupe konten. Klaim sesudah kunci header + cek
      // draft, sebelum createMany; rollback melepaskan key.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id);

      const data = parsed.lines.map((line) => {
        const date = wibDateToUtcMidnight(line.date);
        return {
          bankStatementId,
          date,
          description: line.description,
          amount: line.amount,
          debit: line.type === "debit" ? line.amount : 0,
          credit: line.type === "credit" ? line.amount : 0,
          type: line.type,
          reference: line.reference,
          status: "unmatched",
        };
      });
      // assertPeriodOpen mengunci setting; panggil sekali per tanggal unik
      // (umumnya satu bulan yang sama) sesudah kunci header — urutan lock
      // header -> setting sama dengan penulis baris lain.
      for (const date of [...new Set(data.map((d) => d.date.getTime()))].sort((a, b) => a - b)) {
        await assertPeriodOpen(new Date(date), tx);
      }
      await tx.bankStatementLine.createMany({ data });
      await recalcBankStatementTotals(tx, bankStatementId);
      return data.length;
    });

    await logActivity(
      "create",
      "BankStatement",
      bankStatementId,
      `Import ${imported} baris rekening koran dari CSV`,
    );
    revalidatePath("/keuangan/laporan-bank");
    return { success: true as const, imported };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[importBankStatementLines]", getErrorMessage(e) || e);
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

      // BankReconciliationItem.bankStatementLineId bare Int tanpa FK: hapus
      // baris yang sudah dipakai item rekonsiliasi draft meninggalkannya
      // yatim, lalu complete mensertifikasi kecocokan tanpa baris bank asal.
      // Tolak eksplisit; lepas kecocokan dari layar rekonsiliasi dulu.
      const draftUse = await tx.bankReconciliationItem.findFirst({
        where: { bankStatementLineId: id },
        select: { id: true },
      });
      if (draftUse) {
        throw new Error(
          "Baris rekening koran masih dipakai di rekonsiliasi. Lepaskan kecocokannya terlebih dahulu.",
        );
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
      // Kunci idempotensi per submit create (pola createExpense/
      // createPettyCash): submit ulang/retry dengan key sama ditolak di
      // dalam tx, bukan melahirkan DRAFT duplikat.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id);
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

      // Pengajuan approval atomik dengan dokumen (pola purchase): dokumen
      // tanpa baris approval lolos assertApproved senyap, jadi approval
      // tidak boleh lahir di transaksi terpisah sesudah commit.
      await requestApprovalIfConfigured("Journal", j.id, Number(user.id), tx);

      return j;
    });

    return finishJournalMutation(journal, "create", "Membuat jurnal");
  } catch (e: unknown) {
    return journalMutationError(e, "[createJournal]");
  }
}

export async function postJournal(journalId: number) {
  try {
    const user = await requirePermission("post_journals");

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

      // Pemisahan tugas: tanpa workflow terkonfigurasi assertApproved
      // lolos tanpa baris Approval, jadi pembuat bisa memposting jurnal
      // manualnya sendiri (pola approvePayroll). createdBy null (legacy/
      // sistem) tetap boleh — jurnal sistem lahir POSTED, tak lewat sini.
      if (journal.createdBy != null && Number(journal.createdBy) === Number(user.id)) {
        throw new Error("Jurnal tidak boleh diposting oleh pembuatnya sendiri (pemisahan tugas) — minta pengguna lain yang berizin post_journals.");
      }

      // Gerbang workflow dinilai ULANG di dalam tx terkunci: updateJournal
      // membuka pengajuan pending baru sesudah approval final (R6WN-01) dan
      // edit itu tak mengunci baris jurnal ini, jadi assertApproved di luar
      // tx bisa membaca approval lama "approved" lalu posting isi yang
      // belum disetujui pengajuan barunya.
      await assertApproved("Journal", journalId, tx);

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

      // Titik pengakuan: akun/pusat dinilai hidup di sini — draft lahir atas
      // akun yang kemudian dinonaktifkan tidak boleh POSTED (pola
      // assertAccountsExist hook posting). costCenterId/profitCenterId
      // bare-int tanpa FK: id fiktif tersimpan senyap dan laporan per-pusat
      // kehilangan atribusi; CostCenter juga punya isActive.
      await assertAccountsExist(tx, journal.entries.map((e) => e.accountId), "Jurnal manual");
      // Akun induk (punya anak) bukan akun terposting: saldo terkubur di
      // header COA dan rollup laporan tak konsisten antar format — preseden
      // penolakan di warranty-journal.service.ts (assertPostableAccount).
      const journalAccountIds = [...new Set(journal.entries.map((e) => e.accountId))];
      const withChildren = await tx.account.findMany({
        where: { id: { in: journalAccountIds } },
        select: { id: true, _count: { select: { children: true } } },
      });
      const parentIds = withChildren.filter((a) => a._count.children > 0).map((a) => a.id);
      if (parentIds.length > 0) {
        throw new Error(`Jurnal manual: akun induk tidak bisa diposting (id: ${parentIds.join(", ")}). Pilih akun anak yang terposting.`);
      }
      const costCenterIds = [
        ...new Set(journal.entries.map((e) => e.costCenterId).filter((v): v is number => typeof v === "number" && v > 0)),
      ];
      if (costCenterIds.length > 0) {
        const found = await tx.costCenter.findMany({
          where: { id: { in: costCenterIds }, isActive: true },
          select: { id: true },
        });
        if (found.length !== costCenterIds.length) {
          const missing = costCenterIds.filter((id) => !found.some((f) => f.id === id));
          throw new Error(`Pusat biaya tidak ditemukan atau tidak aktif (id: ${missing.join(", ")}). Pilih ulang pusat biaya sebelum posting.`);
        }
      }
      const profitCenterIds = [
        ...new Set(journal.entries.map((e) => e.profitCenterId).filter((v): v is number => typeof v === "number" && v > 0)),
      ];
      if (profitCenterIds.length > 0) {
        const found = await tx.profitCenter.findMany({
          where: { id: { in: profitCenterIds } },
          select: { id: true },
        });
        if (found.length !== profitCenterIds.length) {
          const missing = profitCenterIds.filter((id) => !found.some((f) => f.id === id));
          throw new Error(`Pusat laba tidak ditemukan (id: ${missing.join(", ")}). Pilih ulang pusat laba sebelum posting.`);
        }
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

/**
 * Pengaju klaim reimbursement wajib masih berhak menerima uang perusahaan
 * (hidup + belum berhenti). Create menolak pengaju berhenti (EC-1), tetapi
 * karyawan bisa berhenti/nonaktif/terhapus sesudah klaim lahir — approve
 * dan bayar menilai ulang di sini, di dalam tx titik uang bergerak.
 */
async function assertClaimantPayable(
  client: Pick<typeof prisma, "employee">,
  employeeId: number | null,
): Promise<void> {
  if (employeeId == null) throw new Error("Klaim tidak tertaut ke karyawan pengaju.");
  const claimant = await client.employee.findUnique({
    where: { id: employeeId },
    select: { isActive: true, deletedAt: true, employmentEndedAt: true },
  });
  if (!claimant || claimant.deletedAt != null || !claimant.isActive || claimant.employmentEndedAt != null) {
    throw new Error("Klaim tidak dapat diproses: karyawan pengaju sudah nonaktif/berhenti — tolak klaim dan selesaikan lewat jalur berhenti.");
  }
}

export async function createExpense(formData: FormData) {
  try {
    const user = await requirePermission("create_expenses");

    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    const parsed = parseFormData(expenseSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("EXP");

    // Akun bare-int tanpa FK: tolak akun mati/ID basi sebelum tulis.
    for (const aid of [v.accountId, v.paidFromAccountId]) {
      if (aid != null) {
        const ok = await prisma.account.findFirst({
          where: { id: aid, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!ok) return { success: false, error: `Akun tidak aktif/terhapus atau tidak ditemukan (id: ${aid}). Pilih ulang akun sebelum menyimpan.` };
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
      // Pengajuan approval atomik dengan dokumen (pola purchase): dokumen
      // tanpa baris approval lolos assertApproved senyap.
      await requestApprovalIfConfigured("Expense", created.id, Number(user.id), tx);
      return created;
    });

    await logActivity("create", "Expense", expense.id, "Membuat pengeluaran");
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
      // FINHR-8: approve fail-closed bila akun beban klaim belum final —
      // harus EXPENSE aktif tak terhapus (placeholder/lama bisa nonaktif
      // atau berganti tipe sesudah klaim dibuat).
      const claimAccount = await prisma.account.findUnique({
        where: { id: expense.accountId },
        select: { type: true, isActive: true, deletedAt: true },
      });
      if (!claimAccount || claimAccount.deletedAt || !claimAccount.isActive || claimAccount.type !== "EXPENSE") {
        throw new Error("Akun beban klaim belum valid (wajib akun beban EXPENSE aktif) — tetapkan akun final sebelum menyetujui.");
      }
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

    // R8-KEU-05: lock baris + cek status + sinkron kas kecil + flip status
    // dalam SATU tx. Jalur lama menyinkronkan kas kecil di tx terpisah lalu flip
    // di luar; kegagalan di antara keduanya meninggalkan kas berkurang sementara
    // expense tetap draft/rejected. Klaim reimbursement sudah memakai pola ini.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM expenses WHERE id = ${expenseId} FOR UPDATE`;
      const locked = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
      if (locked.status !== "draft" && locked.status !== "approved") {
        throw new Error("Expense hanya bisa di-approve dari status draft");
      }
      // Pengaju klaim dinilai ulang hidup/berhenti di titik akrual lahir —
      // klaim karyawan yang sudah berhenti ditolak, bukan diakru.
      if (locked.isReimbursementClaim) await assertClaimantPayable(tx, locked.employeeId);

      // Pemisahan tugas non-klaim: klaim sudah dijaga SoD claimant vs
      // approver employee (BR-RB-07); non-klaim tanpa workflow hanya
      // gerbang ini — pembuat tak boleh menyetujui pengeluarannya sendiri
      // (pola approvePayroll). createdBy null legacy tetap boleh.
      if (!isClaim && locked.createdBy != null && Number(locked.createdBy) === Number(user.id)) {
        throw new Error("Pengeluaran tidak boleh disetujui oleh pembuatnya sendiri (pemisahan tugas) — minta penyetuju lain yang berizin approve_expenses.");
      }

      await onExpenseApprovedSyncPettyCash(expenseId, Number(user.id), tx);
      if (isClaim) {
        // J-RB1: akrual gagal (setting 210209 kosong/periode tutup) = klaim
        // tetap draft, bukan setengah berjurnal.
        await onReimbursementClaimApproved(expenseId, Number(user.id), tx);
      }
      const claim = await tx.expense.updateMany({
        where: { id: expenseId, status: { in: ["draft", "approved"] } },
        data: { status: "approved", approvedBy: Number(user.id) },
      });
      if (claim.count === 0) {
        throw new Error("Pengeluaran sudah diproses atau status tidak valid");
      }
    });

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

      // Pengaju dinilai ulang sebelum uang keluar: karyawan yang berhenti
      // sesudah approve tidak dibayar lewat klaim (jalur berhenti yang sah).
      if (locked.isReimbursementClaim) await assertClaimantPayable(tx, locked.employeeId);

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
  opts?: { guardNegative?: boolean; excludeVoid?: boolean },
): Promise<void> {
  const where = opts?.excludeVoid ? { status: "posted", deletedAt: null } : {}
  const all = await tx.pettyCash.findMany({
    where,
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

/**
 * Remove the accounting journal (and its entries) tied to a petty-cash record.
 *
 * R8-KEU-08: helper ini dulu menghapus SEMUA jurnal referensi PettyCash
 * termasuk POSTED. Satu-satunya pemanggil (`updatePettyCash`) sudah menolak
 * jurnal POSTED di luar tx, tapi cek itu balapan dengan posting/void/recon —
 * guard otoritatif harus di dalam tx, di titik tulis bersama ini: jurnal
 * POSTED tidak pernah di-hard-delete (koreksi sah = reversal lewat void).
 * Fail-closed untuk SEMUA status non-DRAFT: jurnal REVERSED yang dihapus
 * menyisakan lawan POSTED yatim dan memutus rantai reversal (patokan
 * accounting.hook — REVERSED tak boleh dihapus), REVERSING sedang dalam
 * pemulihan cron ke POSTED.
 */
async function deletePettyCashJournal(
  tx: PettyCashTx,
  pettyCashId: number,
): Promise<void> {
  const journals = await tx.journal.findMany({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (journals.length === 0) return;
  if (journals.some((j) => j.status !== "DRAFT" && !j.deletedAt)) {
    throw new Error(
      "Transaksi kas kecil yang sudah terposting tidak dapat diubah. Batalkan lewat pembatalan beralasan lalu buat transaksi baru.",
    );
  }
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

    // Akun bare-int tanpa FK (PettyCash.accountId): tolak akun mati/ID basi.
    if (v.accountId != null) {
      const ok = await prisma.account.findFirst({
        where: { id: v.accountId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!ok) return { success: false, error: `Akun tidak aktif/terhapus atau tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.` };
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
        // Konvensi GL repo (report-aggregation.service.ts REPORT_JOURNAL_STATUSES):
        // jurnal asal REVERSED + jurnal lawan POSTED berpasangan net-zero. Hanya
        // POSTED terhitung → asal (kredit sumber) terbuang, lawan (debit
        // sumber) terhitung → saldo sumber menggelembung sebesar reversal.
        const sourceEntries = await tx.journalEntry.findMany({
          where: {
            accountId: sourceId,
            journal: { status: { in: ["POSTED", "REVERSED"] }, deletedAt: null },
          },
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
      // Ekor rantai = record AKTIF terakhir: record void/deleted
      // balanceAfter-nya beku sebagai snapshot historis (GL-BR-003) dan
      // tidak berkontribusi saldo — memakainya sebagai balanceBefore
      // membuat OUT aktif sesudahnya ditolak dengan saldo basi.
      const lastRecord = await tx.pettyCash.findFirst({
        where: { status: "posted", deletedAt: null },
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
          // Akun pilihan form adalah akun sumber (IN) / beban (OUT) —
          // petakan ke kolom yang benar-benar dibaca jurnal hook
          // (sourceAccountId/expenseAccountId), bukan hanya accountId
          // tampilan; tanpa ini jurnal selalu akun default setting.
          sourceAccountId: type === "IN" ? (v.accountId ?? null) : null,
          expenseAccountId: type === "OUT" ? (v.accountId ?? null) : null,
          referenceNo: v.referenceNo ?? null,
          description: v.description ?? null,
          projectId: v.projectId ?? null,
          vendorId: v.vendorId ?? null,
          categoryId: v.categoryId ?? null,
          createdBy: Number(user.id),
        },
      });
      // Keep the running-balance chain correct regardless of insertion order.
      // excludeVoid: record void/deleted dibekukan sebagai snapshot historis
      // (GL-BR-003) — recalc tanpa filter menulis ulang saldo beku mereka.
      await recalcPettyCashChain(tx, { guardNegative: true, excludeVoid: true });
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

    // accountId bare-int tanpa FK: akun fiktif/nonaktif/terhapus/non-ASSET
    // lahir sebagai rekonsiliasi atas akun hantu. Picker hanya menawarkan
    // isActive + type ASSET; gerbang server menyamakan kontrak itu (dokumen
    // bebas, pola create putaran 30-33).
    const liveAccount = await prisma.account.findFirst({
      where: { id: v.accountId, isActive: true, deletedAt: null, type: "ASSET" },
      select: { id: true },
    });
    if (!liveAccount) {
      throw new Error("Akun rekonsiliasi tidak ditemukan, tidak aktif atau bukan akun aset");
    }

    const reconciliationNumber = await generateDocumentNumber("REC");

    // Putaran 63: tanpa key, retry identik melahirkan dua draft
    // rekonsiliasi untuk akun/periode sama yang masing-masing bisa
    // disertifikasi terpisah.
    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    const reconciliation = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id);
      return tx.bankReconciliation.create({
        data: {
          reconciliationNumber,
          slug: await nextSlugWithClient(tx as never, "bankReconciliation", reconciliationNumber),
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

      // R8-KEU-06: satu baris jurnal / rekening koran hanya boleh menutup satu
      // rekonsiliasi yang selesai. UNIQUE lama hanya komposit per-recon, jadi
      // cek ini harus global terhadap completed — bukan hanya recon ini.
      // Item pada draft lain tetap boleh ada lebih dulu (draft dapat dihapus
      // atau di-unmatch); completed yang menang, bukan order pembuatan draft.
      const occupied = await tx.bankReconciliationItem.findFirst({
        where: {
          bankReconciliation: { status: "completed" },
          OR: [{ journalEntryId }, { bankStatementLineId: lineId }],
        },
        select: { id: true },
      });
      if (occupied) {
        throw new Error("Entri jurnal atau baris rekening koran sudah pernah dipakai di rekonsiliasi yang selesai");
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
    const user = await requirePermission("manage_bank_reconciliation");

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

      // Putaran 63: retry identik melahirkan item penyesuaian kembar
      // yang menggeser adjustedBookBalance dua kali saat penyelesaian.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id);

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

      // R8-KEU-07: saldo buku yang diketik bebas tidak boleh menjadi
      // sertifikasi. Buku besar adalah sumber saldo buku di aplikasi ini,
      // jadi saldo tersimpan wajib tie-out ke jurnal POSTED/REVERSED
      // (semantik agregasi laporan) s/d akhir hari tanggal koran/periode.
      const cutoffDate = reconciliation.periodEnd ?? reconciliation.statementDate;
      const cutoffExclusive = new Date(cutoffDate);
      cutoffExclusive.setUTCDate(cutoffExclusive.getUTCDate() + 1);
      const glTotals = await tx.journalEntry.aggregate({
        where: {
          accountId: reconciliation.accountId,
          journal: {
            status: { in: ["POSTED", "REVERSED"] },
            deletedAt: null,
            transactionDate: { lt: cutoffExclusive },
          },
        },
        _sum: { debit: true, credit: true },
      });
      const glBookBalance = safeSubtract(
        Number(glTotals._sum.debit ?? 0),
        Number(glTotals._sum.credit ?? 0),
        2,
      );
      const storedBookBalance = Number(reconciliation.bookBalance);
      if (Math.abs(safeSubtract(storedBookBalance, glBookBalance, 2)) >= 0.01) {
        throw new Error(
          `Saldo buku tersimpan ${storedBookBalance.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tidak sama dengan saldo buku besar ${glBookBalance.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Periksa jurnal akun ini sebelum menyelesaikan rekonsiliasi.`,
        );
      }

      // R8-KEU-07: janji UI "semua baris harus tercocok" berlaku untuk
      // seluruh baris koran akun dalam cakupan, bukan hanya baris yang
      // kebetulan sudah menjadi item rekonsiliasi ini. Baris yang sudah
      // dikonsumsi rekonsiliasi completed lain tidak dihitung ulang.
      const matchedLineIds = new Set(
        reconciliation.items
          .map((i) => i.bankStatementLineId)
          .filter((v): v is number => v != null),
      );
      const scopedLines = await tx.bankStatementLine.findMany({
        where: {
          bankStatement: { accountId: reconciliation.accountId },
          date: {
            ...(reconciliation.periodStart ? { gte: reconciliation.periodStart } : {}),
            lt: cutoffExclusive,
          },
        },
        select: { id: true },
      });
      const scopedLineIds = scopedLines.map((l) => l.id);
      const completedItems = scopedLineIds.length > 0
        ? await tx.bankReconciliationItem.findMany({
            where: {
              bankReconciliation: { status: "completed" },
              bankStatementLineId: { in: scopedLineIds },
            },
            select: { bankStatementLineId: true },
          })
        : [];
      const completedLineIds = new Set(
        completedItems
          .map((i) => i.bankStatementLineId)
          .filter((v): v is number => v != null),
      );
      const uncoveredLineIds = scopedLineIds.filter(
        (id) => !matchedLineIds.has(id) && !completedLineIds.has(id),
      );
      if (uncoveredLineIds.length > 0) {
        throw new Error(
          `${uncoveredLineIds.length} baris rekening koran dalam cakupan rekonsiliasi belum dicocokkan. Cocokkan semua baris sebelum menyelesaikan rekonsiliasi.`,
        );
      }

      // R8-KEU-06: complete harus memenangkan kunci global (journalEntryId,
      // bankStatementLineId) yang di-cek saat match. Lock baris jurnal lalu
      // baris koran (urutan global konsisten: jurnal dulu baru koran) di dalam
      // tx yang memegang lock induk — tanpa ini, dua draft lengkap yang
      // mengklaim baris yang sama bisa sama-sama completed.
      const lockEntryIds = [...new Set(reconciliation.items.map((i) => i.journalEntryId).filter((v): v is number => v != null))].sort((a, b) => a - b);
      const lockLineIds = [...new Set(reconciliation.items.map((i) => i.bankStatementLineId).filter((v): v is number => v != null))].sort((a, b) => a - b);
      for (const entryId of lockEntryIds) {
        await tx.$executeRaw`SELECT id FROM journal_entries WHERE id = ${entryId} FOR UPDATE`;
      }
      for (const lineId of lockLineIds) {
        await tx.$executeRaw`SELECT id FROM bank_statement_lines WHERE id = ${lineId} FOR UPDATE`;
      }
      // Sertifikasi hanya atas jurnal yang MASIH posted: jurnal item
      // ter-match bisa dibalik (reverseJournal) sesudah match — complete
      // yang mensertifikasinya mengunci baris koran ke entri jurnal mati
      // dan rekonsiliasi completed tidak bisa di-unmatch lagi. Status
      // dibaca ulang di sini, di bawah kunci baris entri jurnal.
      if (lockEntryIds.length > 0) {
        const matchedEntries = await tx.journalEntry.findMany({
          where: { id: { in: lockEntryIds } },
          select: { id: true, journal: { select: { status: true, deletedAt: true } } },
        });
        const deadEntry = matchedEntries.find(
          (e) => e.journal.status !== "POSTED" || e.journal.deletedAt,
        );
        if (matchedEntries.length !== lockEntryIds.length || deadEntry) {
          throw new Error(
            "Sebagian jurnal yang dicocokkan sudah dibalik atau terhapus. Lepas kecocokannya dan cocokkan ke jurnal yang masih posted sebelum menyelesaikan rekonsiliasi.",
          );
        }
      }
      const alreadyUsed = await tx.bankReconciliationItem.findFirst({
        where: {
          bankReconciliationId: { not: reconciliationId },
          bankReconciliation: { status: "completed" },
          OR: [
            ...(lockEntryIds.length > 0 ? [{ journalEntryId: { in: lockEntryIds } }] : []),
            ...(lockLineIds.length > 0 ? [{ bankStatementLineId: { in: lockLineIds } }] : []),
          ],
        },
        select: { id: true },
      });
      if (alreadyUsed) {
        throw new Error("Sebagian baris sudah pernah dipakai di rekonsiliasi yang selesai");
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
  if (message.includes("duplikat") || message.includes("sudah digunakan")) {
    return { success: false as const, error: message };
  }
  console.error(tag, message || e);
  return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
}

export async function createProfitCenter(formData: FormData) {
  try {
    const user = await requirePermission("create_profit_centers");

    const parsed = parseFormData(profitCenterSchema, formData);
    if (!parsed.success) return { success: false as const, error: parsed.error };
    const v = parsed.data;

    // Putaran 70: key + klaim kode ternormalisasi di bawah gap-lock tabel.
    // Versi lama create polos: retry melahirkan pusat laba kembar berkode
    // mirip tetapi tidak identik; klaim JS di bawah kunci membuat tabrakan
    // kapital terpetakan dukplikat sejak awal.
    const center = await prisma.$transaction(async (tx) => {
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id);
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM profit_centers FOR UPDATE`;
      }
      const codeKey = v.code.trim().toLowerCase();
      const siblings = await tx.profitCenter.findMany({ select: { id: true, code: true } });
      if (siblings.some((row) => row.code.trim().toLowerCase() === codeKey)) {
        throw new Error("Kode pusat laba sudah digunakan");
      }
      return tx.profitCenter.create({
        data: { code: v.code, name: v.name },
      });
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

    // Putaran 70: klaim kode ternormalisasi dalam tx gap-lock (pola
    // updateMethod/updateCostCenter); update polos hanya ditahan P2002.
    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM profit_centers FOR UPDATE`;
      }
      const codeKey = v.code.trim().toLowerCase();
      const siblings = await tx.profitCenter.findMany({ select: { id: true, code: true } });
      if (siblings.some((row) => row.id !== id && row.code.trim().toLowerCase() === codeKey)) {
        throw new Error("Kode pusat laba sudah digunakan");
      }
      await tx.profitCenter.update({
        where: { id },
        data: { code: v.code, name: v.name },
      });
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

    // Guard + delete dalam SATU transaksi dengan baris ProfitCenter dikunci
    // (pola deleteCostCenter AUD-COSTCENTER-01): penunjuk konkuren di antara
    // hitungan dan delete tak terlihat guard. Perujuk: CostCenter.profitCenterId
    // (FK tanpa onDelete → P2003) + JournalEntry.profitCenterId bare-int tanpa
    // relasi (hapus sukses meninggalkan entri yatim; laporan pusat laba lalu
    // menamainya "Tanpa Pusat Laba").
    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM profit_centers WHERE id = ${id} FOR UPDATE`;
      }
      const [usedByCostCenters, usedByEntries] = await Promise.all([
        tx.costCenter.count({ where: { profitCenterId: id } }),
        tx.journalEntry.count({ where: { profitCenterId: id } }),
      ]);
      const usages = [
        usedByCostCenters > 0 ? `${usedByCostCenters} pusat biaya` : null,
        usedByEntries > 0 ? `${usedByEntries} entri jurnal` : null,
      ].filter((u): u is string => u !== null);
      if (usages.length > 0) {
        throw new Error(`Pusat laba masih digunakan (${usages.join(", ")}). Lepaskan dulu sebelum menghapus.`);
      }
      await tx.profitCenter.delete({ where: { id } });
    });

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

    const parsed = parseFormData(costCenterSchema, formData);
    if (!parsed.success)
      return { success: false, error: `Validasi gagal: ${parsed.error}` };
    const v = parsed.data;

    // Nama tanpa @unique DB (code memang @unique dan wajib): cek findFirst
    // pra-parse di luar tx kalah balapan — dua create konkuren melahirkan
    // dua pusat biaya bernama sama (slug bersuffix, bukan blokir) dan kode
    // bentrok hanya muncul sebagai P2002 mentah. Cek+create dalam tx
    // bergap-lock (pola createTax putaran 53): nama sama (trim+lowercase)
    // -> reuse; kode bentrok -> tolak menyebut kode tersimpan. Model tanpa
    // deletedAt: semua baris = himpunan yang dinilai.
    const result = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM cost_centers FOR UPDATE`;
      }
      const candidates = await tx.costCenter.findMany({
        select: { id: true, name: true, code: true, slug: true },
      });
      const key = (value: string) => value.trim().toLowerCase();
      const byName = candidates.find((row) => key(row.name) === key(v.name));
      if (byName) return { kind: "reuse" as const, id: byName.id, slug: byName.slug };
      const byCode = candidates.find((row) => key(row.code) === key(v.code));
      if (byCode) {
        throw new Error(
          `Kode pusat biaya ${byCode.code} sudah dipakai pusat biaya "${byCode.name}"; pakai kode lain.`,
        );
      }
      // Putaran 68: jalur create menilai induk dari himpunan terkunci yang
      // sama: FK hanya menolak induk fiktif (P2003 mentah), dan tanpa cek
      // ini parentId menggantung lolos. Pesan homolog jalur update
      // (updateCostCenter "Pusat biaya induk tidak ditemukan").
      if (v.parentId != null && !candidates.some((row) => row.id === v.parentId)) {
        throw new Error("Pusat biaya induk tidak ditemukan");
      }
      const created = await tx.costCenter.create({
        data: {
          code: v.code,
          name: v.name,
          slug: await nextSlugWithClient(tx as never, "costCenter", v.name),
          description: v.description ?? null,
          isActive: v.isActive,
          parentId: v.parentId ?? null,
        },
      });
      return { kind: "created" as const, id: created.id, slug: created.slug };
    });
    if (result.kind === "reuse") {
      return { success: true, id: result.id, slug: result.slug ?? undefined };
    }

    await logActivity(
      "create",
      "CostCenter",
      result.id,
      "Membuat pusat biaya",
    );
    revalidatePath("/keuangan/pusat-biaya");
    return { success: true, id: result.id };
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

    const newParentId = v.parentId ?? null;

    // Anti-siklus di bawah kunci (pola updateAccount): baris ini + induk baru
    // dikunci urut id dalam tx, rantai induk dinilai dari bacaan terkunci.
    // Tanpa ini parentId menunjuk diri sendiri/keturunan — bahkan dua update
    // silang dari snapshot form lama — membentuk siklus dan node hilang dari
    // daftar pusat biaya yang hanya berjalan dari root.
    const outcome = await prisma.$transaction(async (tx) => {
      const lockIds = [...new Set(newParentId ? [id, newParentId] : [id])].sort((a, b) => a - b);
      for (const lockId of lockIds) {
        await tx.$queryRaw`SELECT id FROM cost_centers WHERE id = ${lockId} FOR UPDATE`;
      }

      if (newParentId) {
        if (newParentId === id) {
          return { error: "Pusat biaya tidak dapat menjadi induk bagi dirinya sendiri" };
        }
        let cursor = await tx.costCenter.findUnique({
          where: { id: newParentId },
          select: { id: true, parentId: true },
        });
        if (!cursor) return { error: "Pusat biaya induk tidak ditemukan" };
        for (let depth = 0; cursor && depth < 100; depth++) {
          if (cursor.parentId === id) {
            return { error: "Pusat biaya induk tidak boleh berupa sub pusat biaya dari pusat biaya ini" };
          }
          if (cursor.parentId === null) break;
          cursor = await tx.costCenter.findUnique({
            where: { id: cursor.parentId },
            select: { id: true, parentId: true },
          });
        }
      }

      // Putaran 70: klaim kode ternormalisasi homolog createCostCenter —
      // create menolak kode milik lain menyebut kode tersimpan, sedangkan
      // update sebelumnya hanya tertahan P2002 mentah @unique. Nama tetap
      // bebas (tampilkan duplikat sah, rename create memakai reuse).
      // Daftar sibling dibaca dari himpunan terkunci yang sama.
      const candidates = await tx.costCenter.findMany({
        select: { id: true, name: true, code: true },
      });
      const codeKey = v.code.trim().toLowerCase();
      const byCode = candidates.find(
        (row) => row.id !== id && row.code.trim().toLowerCase() === codeKey,
      );
      if (byCode) {
        return {
          error: `Kode pusat biaya ${byCode.code} sudah dipakai pusat biaya "${byCode.name}"; pakai kode lain.`,
        };
      }

      await tx.costCenter.update({
        where: { id },
        data: {
          code: v.code,
          name: v.name,
          // Putaran 70: slug rename lewat delegate tx (pola updateVehicle).
          slug: await nextSlugWithClient(tx as never, "costCenter", v.name, { excludeId: id }),
          description: v.description ?? null,
          isActive: v.isActive,
          // Must be written on update as well: cost-center-form renders the "Induk"
          // combobox and createCostCenter already persists parentId. Without this the
          // hierarchy edit was silently discarded (UI still reported success).
          parentId: newParentId,
        },
      });
      return { updated: true as const };
    });
    if ("error" in outcome) return { success: false, error: outcome.error };

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
    // Allowlist DRAFT saja: REVERSED yang terhapus menyisakan lawan POSTED
    // yatim (GL timpang nominal penuh), REVERSING sedang dipulihkan cron.
    if (journal.status !== "DRAFT") {
      throw new Error("Tidak bisa menghapus journal yang sudah POSTED");
    }

    // Laravel parity: cascade delete entries then journal.
    // F-01 selaras postJournal: pratinjau di atas hanya fast-fail. Status
    // diputus ulang di dalam tx SESUDAH baris jurnal dikunci FOR UPDATE —
    // tanpa ini postJournal yang commit di antara pratinjau dan hapus
    // membuat jurnal POSTED ikut terhapus permanen.
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM journals WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.journal.findUniqueOrThrow({ where: { id } });
      if (locked.status !== "DRAFT") {
        throw new Error("Tidak bisa menghapus journal yang sudah POSTED");
      }
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

    // R8-KEU-04: lock + recheck + delete dalam satu tx. Baca status di luar tx
    // tidak cukup: approve/mark-paid yang commit sesudah baca bisa meninggalkan
    // jurnal POSTED atau kas kecil yatim saat delete tetap menghapus sumbernya.
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.expense.findUniqueOrThrow({ where: { id } });
      if (locked.status === "approved" || locked.status === "paid") {
        throw new Error(
          "Tidak bisa menghapus expense yang sudah approved atau paid",
        );
      }

      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "Expense", referenceId: id,
      });
      const deleted = await tx.expense.deleteMany({
        where: { id, status: { notIn: ["approved", "paid"] } },
      });
      if (deleted.count === 0) {
        throw new Error(
          "Tidak bisa menghapus expense yang sudah approved atau paid",
        );
      }
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

export async function deletePettyCash(id: number, reason?: string) {
  try {
    await requirePermission("delete_petty_cash");
    const cleanReason = (reason ?? "").trim();
    if (!cleanReason) {
      return { success: false, error: "Alasan pembatalan kas kecil wajib diisi." };
    }

    let documentNo = "";
    await prisma.$transaction(async (tx) => {
      // Race guard: gap-lock tabel + kunci baris target SELAMA void.
      // Tanpa ini create/edit bersamaan baca rantai pra-void lalu tulis
      // setelah void commit — saldo rantai dihitung dari data basi.
      await tx.$executeRaw`SELECT id FROM petty_cash WHERE id = ${id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`;

      const record = await tx.pettyCash.findUniqueOrThrow({ where: { id } });
      if (record.deletedAt || record.status === "void") {
        throw new Error("Transaksi kas kecil ini sudah dibatalkan.");
      }
      // Sesudah gap-lock: expense terhapus konkuren tak menghidupkan kembali.
      await assertPettyCashNotExpenseSync(tx, record);
      documentNo = record.documentNo;

      // V-P5/P6-3: cek periode atas tanggal asal DI DALAM tx (cek luar-tx
      // tidak cukup — ada celah balapan tutup-periode; jalur lama bahkan
      // tidak punya cek sama sekali).
      const postingDate = record.transactionDate ?? record.date;
      await assertPeriodOpen(postingDate, tx);

      // Recon guard (rekomendasi 6): entri jurnal kas kecil yang sudah
      // dipakai item rekonsiliasi final (completed) tidak boleh
      // di-REVERSED diam-diam.
      const linkedEntryIds = await tx.journalEntry.findMany({
        where: { journal: { referenceType: "PettyCash", referenceId: id } },
        select: { id: true },
      });
      if (linkedEntryIds.length > 0) {
        const matched = await tx.bankReconciliationItem.findFirst({
          where: {
            journalEntryId: { in: linkedEntryIds.map((e) => e.id) },
            matched: true,
            bankReconciliation: { status: "completed" },
          },
          select: { id: true },
        });
        if (matched) {
          throw new Error(
            "Transaksi kas kecil ini sudah cocok pada rekonsiliasi bank final. Batalkan rekonsiliasi terlebih dahulu sebelum membatalkan.",
          );
        }
      }

      // Jurnal lawan cermin lewat helper reversal (refType persis "PettyCash");
      // helper menandai jurnal asal REVERSED + assertPeriodOpen tanggal asal.
      await reverseJournalsByReferenceTx(tx, "PettyCash", id, cleanReason, undefined);

      // Mark void + keluarkan dari rantai aktif; saldo record void dibekukan
      // sebagai snapshot historis (tidak ditulis ulang recalc).
      await tx.pettyCash.update({
        where: { id },
        data: {
          status: "void",
          voidAt: new Date(),
          voidReason: cleanReason,
          deletedAt: new Date(),
        },
      });

      // V-P5/P6-6: void dikeluarkan dari rantai aktif — saldo record sesudahnya
      // dihitung ulang tanpa kontribusi record ini. Void yang membuat rantai
      // aktif negatif DITOLAK (guardNegative) — koreksi berurutan dari ekor.
      await recalcPettyCashChain(tx, { guardNegative: true, excludeVoid: true });
    });

    await logActivity(
      "void",
      "PettyCash",
      id,
      `Membatalkan transaksi kas kecil ${documentNo}: ${cleanReason}`,
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

    // Guard + delete dalam SATU transaksi dengan baris CostCenter dikunci
    // (AUD-COSTCENTER-01): bentuk lama menghitung pemakai di luar transaksi
    // lalu menghapus — dokumen yang mengaitkan diri di antara dua fase itu
    // tidak terlihat guard, lalu kolomnya yatim (payroll/materialIssue/
    // project ber-FK SET NULL; expense plain-int tak bisa direkonstruksi).
    // Urutan kunci: Baris CostCenter dulu (FOR UPDATE), lalu semua count
    // dan delete di snapshot yang sama.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM cost_centers WHERE id = ${id} FOR UPDATE`;
      const [children, payrolls, materialIssues, projects, expenses, journalEntries, vendorBills, vendorBillItems] = await Promise.all([
        tx.costCenter.count({ where: { parentId: id } }),
        tx.payroll.count({ where: { costCenterId: id } }),
        tx.materialIssue.count({ where: { costCenterId: id } }),
        tx.project.count({ where: { costCenterId: id } }),
        tx.expense.count({ where: { costCenterId: id } }),
        // JournalEntry.costCenterId bare-int tanpa relasi: hard delete
        // sukses meninggalkan entri yatim yang tak bisa direkonstruksi.
        tx.journalEntry.count({ where: { costCenterId: id } }),
        // VendorBill/VendorBillItem.costCenterId juga bare-int tanpa relasi:
        // hard delete meninggalkan tagihan/baris yatim dan laporan biaya hilang.
        tx.vendorBill.count({ where: { costCenterId: id } }),
        tx.vendorBillItem.count({ where: { costCenterId: id } }),
      ]);
      const usages = [
        children > 0 ? `${children} pusat biaya anak` : null,
        payrolls > 0 ? `${payrolls} penggajian` : null,
        materialIssues > 0 ? `${materialIssues} pengeluaran material` : null,
        projects > 0 ? `${projects} proyek` : null,
        expenses > 0 ? `${expenses} pengeluaran` : null,
        journalEntries > 0 ? `${journalEntries} entri jurnal` : null,
        vendorBills > 0 ? `${vendorBills} tagihan vendor` : null,
        vendorBillItems > 0 ? `${vendorBillItems} baris tagihan vendor` : null,
      ].filter((u): u is string => u !== null);
      if (usages.length > 0) {
        throw new Error(`Pusat biaya masih digunakan (${usages.join(", ")}). Lepaskan dulu sebelum menghapus.`);
      }
      await tx.costCenter.delete({ where: { id } });
    });

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

      // Edit membuka kembali pengajuan bila approval sebelumnya ditolak
      // (resubmit); tanpa workflow terkonfigurasi ini no-op. Atomik dengan
      // edit: dokumen berubah tanpa pengajuan baru lolos assertApproved
      // senyap terhadap isi yang tidak pernah disetujui.
      await requestApprovalIfConfigured("Journal", id, Number(user.id), tx);

      return j;
    });

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

      // Putaran 47: jurnal siklus aset (perolehan/pelepasan/penyusutan masa/
      // peristiwa perubahan) tidak boleh lewat jalur generik ini. Pembaca
      // aset (cron penyusutan, disposal, registry) hanya membaca pasangan
      // POSTED referenceType aset; reversal generik lahir sebagai "Journal"
      // sehingga asli yang REVERSED lenyap dari nilai buku jurnal sementara
      // status/peristiwa aset tidak ikut dibatalkan — aset yatim di GL.
      // Koreksi jurnal aset lewat jalur aset (reversal peristiwa perubahan,
      // disposal, jurnal koreksi manual).
      if (
        journal.referenceType === "ASSET_ACQUISITION" ||
        journal.referenceType === "ASSET_DISPOSAL" ||
        journal.referenceType === "ASSET_CHANGE_EVENT" ||
        journal.referenceType?.startsWith("ASSET_DEPRECIATION_")
      ) {
        throw new Error(
          "Jurnal siklus aset tidak dapat dibalik lewat jurnal umum. Koreksi melalui jalur aset (peristiwa perubahan/pelepasan) atau jurnal koreksi manual.",
        );
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

    // Akun bare-int tanpa FK: tolak akun mati/ID basi sebelum tulis.
    for (const aid of [v.accountId, v.paidFromAccountId]) {
      if (aid != null) {
        const ok = await prisma.account.findFirst({
          where: { id: aid, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!ok) throw new Error(`Akun tidak aktif/terhapus atau tidak ditemukan (id: ${aid}). Pilih ulang akun sebelum menyimpan.`);
      }
    }

    // ISF-01 sekelas: update + klaim lampiran dalam SATU tx. Dulu update
    // berjalan tanpa tx lalu klaim di tx terpisah — klaim gagal = perubahan
    // sudah commit tapi action menjawab gagal.
    const expense = await prisma.$transaction(async (tx) => {
      // Kunci baris lalu baca ulang status: cek draft di atas berjalan di
      // luar tx, jadi approveExpense/markExpensePaid konkuren bisa commit
      // di antaranya — tanpa ini expense yang sudah disetujui (bahkan
      // jurnalnya POSTED) hidup lagi sebagai draft lewat update ini.
      await tx.$executeRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
      const lockedExpense = await tx.expense.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (lockedExpense.status !== "draft") {
        throw new Error(
          "Hanya pengeluaran dengan status draft yang dapat diubah",
        );
      }
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

/**
 * Baris sinkronisasi expense (hook `onExpenseApprovedSyncPettyCash`) membawa
 * nomor dokumen expense di `referenceNo` dan TIDAK punya jurnal "PettyCash" —
 * GL-nya jurnal "Expense". Jalur generik kas kecil (ubah/void) harus menolak:
 * edit memposting pengeluaran kedua lewat onPettyCashCreated sedangkan void
 * hanya mereverse jurnal "PettyCash" (no-op), sehingga jurnal Expense tetap
 * POSTED dan subledger lepas dari GL. Koreksi dilakukan pada expense-nya.
 * Lookup terbalik bersifat unik: `Expense.documentNo` terindeks.
 */
async function assertPettyCashNotExpenseSync(
  client: PettyCashTx | typeof prisma,
  row: { referenceNo: string | null } | null,
): Promise<void> {
  if (!row?.referenceNo) return;
  const expense = await client.expense.findFirst({
    where: { documentNo: row.referenceNo },
    select: { id: true },
  });
  if (expense) {
    throw new Error(
      "Transaksi kas kecil ini tercatat otomatis dari expense terposting — ubah atau batalkan dari expense asal, bukan dari kas kecil.",
    );
  }
}

export async function updatePettyCash(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_petty_cash");

    // GL-BR-003 P6 (vonis t_16159d89 V-P5/P6-5): record ber-jurnal POSTED
    // BEKU total — termasuk metadata. Salah catat ditangani void + buat baru.
    // Cek jurnal (bukan hanya status baris) supaya baris legacy tanpa penanda
    // void pun tetap beku bila jurnal POSTED-nya ada.
    const journalGuard = await prisma.journal.findFirst({
      where: { referenceType: "PettyCash", referenceId: id, status: "POSTED" },
      select: { id: true },
    });
    if (journalGuard) {
      return {
        success: false,
        error:
          "Transaksi kas kecil yang sudah terposting tidak dapat diubah. Batalkan lewat pembatalan beralasan lalu buat transaksi baru.",
      };
    }
    const voidGuard = await prisma.pettyCash.findFirst({
      where: { id, status: "void" },
      select: { id: true },
    });
    if (voidGuard) {
      return { success: false, error: "Transaksi kas kecil yang sudah dibatalkan tidak dapat diubah." };
    }

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

    // Akun bare-int tanpa FK (PettyCash.accountId): tolak akun mati/ID basi.
    if (v.accountId != null) {
      const ok = await prisma.account.findFirst({
        where: { id: v.accountId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!ok) throw new Error(`Akun tidak aktif/terhapus atau tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.`);
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
        select: { documentNo: true, status: true, deletedAt: true, referenceNo: true },
      });
      await assertPettyCashNotExpenseSync(tx, existingPettyCash);
      // Guard luar bisa basi: void konkuren yang menang kunci lebih dulu
      // tidak boleh diedit kembali — jurnal asal ter-void lolos guard
      // deletePettyCashJournal sehingga baris void mendapat jurnal baru.
      if (existingPettyCash.status === "void" || existingPettyCash.deletedAt) {
        throw new Error("Transaksi kas kecil yang sudah dibatalkan tidak dapat diubah.");
      }

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
          sourceAccountId: type === "IN" ? (v.accountId ?? null) : null,
          expenseAccountId: type === "OUT" ? (v.accountId ?? null) : null,
          referenceNo: v.referenceNo ?? null,
          description: v.description ?? null,
          projectId: v.projectId ?? null,
          vendorId: v.vendorId ?? null,
          categoryId: v.categoryId ?? null,
          slug: await nextSlug("pettyCash", existingPettyCash.documentNo, { excludeId: id }),
        },
      });

      // Recompute running balances for the whole chain (this + subsequent records).
      // excludeVoid sama seperti create: void/deleted beku, tak ditulis ulang.
      await recalcPettyCashChain(tx, { guardNegative: true, excludeVoid: true });

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

