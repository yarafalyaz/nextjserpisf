/**
 * Inti posting jurnal penutup tahunan (YearEndClosing) — F-2026-10-23-121-V
 * (vonis BOT 4 PR #637, gerbang inti F-2026-10-20-86).
 *
 * Putusan yang dieksekusi persis:
 * 1. Akun tujuan = `SystemSetting.retainedEarningsAccountId` nullable
 *    fail-closed: kosong / nonaktif / terhapus / non-EQUITY / bukan akun
 *    laba ditahan (`isRetainedEarningsAccount`) = posting DITOLAK berisik,
 *    nol jurnal. Tanpa tebakan akun (jangan hardcode 300002).
 * 2. Posting SATU transaksi: `assertApproved` sebelum tx -> kunci baris
 *    `system_settings FOR UPDATE` lewat `assertPeriodOpen(tanggalPenutup,
 *    tx)` (protokol R-09 yang sama dengan tutup periode) -> anti-dobel
 *    POSTED di dalam tx -> saldo dihitung builder pratinjau yang SAMA
 *    (`buildYearEndClosingPreview`, impor bukan salin rumus) -> selisih
 *    != 0 sen ditolak -> SATU Jurnal POSTED `YearEndClosing`/`fiscalYear`
 *    berisi baris penutup per (akun P&L, profitCenterId) + baris lawan
 *    laba ditahan per profitCenterId (termasuk null terpisah).
 * 3. Koreksi HANYA reversal penuh di periode terbuka: jurnal lawan
 *    (debit/kredit ditukar, profitCenterId dipertahankan) + jurnal asli
 *    jadi REVERSED. Edit/hapus/ubah referenceId jurnal penutup dilarang.
 * 4. Approval existing (`requestApprovalIfConfigured`/`assertApproved`)
 *    tanpa workflow terkonfigurasi = no-op; izin `manage_settings`
 *    ditegakkan di lapisan server action. Tanpa dokumen pajak apa pun.
 *
 * Titik terbuka (menunggu vonis BOT 4 kartu t_f3b69185): posting ulang
 * sesudah reversal saat ini tertahan unik fisik
 * `journals_reference_unique (reference_type, reference_id)` yang juga
 * menghitung baris REVERSED. Posting yang menabraknya diterjemahkan jadi
 * error berisik di sini — BUKAN P2002 mentah, BUKAN sukses palsu.
 */

import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { assertApproved, requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service"
import { isRetainedEarningsAccount } from "@/lib/reports/equity-changes"
import {
  buildYearEndClosingPreview,
  fiscalYearPeriod,
  YEAR_END_CLOSING_REFERENCE_TYPE,
} from "@/lib/reports/year-end-closing"
import { collectYearEndClosingEntries } from "@/lib/reports/year-end-closing-data"
import { generateDocumentNumber } from "@/lib/utils/document-number"

export interface YearEndClosingPostResult {
  journalId: number
  journalNumber: string
  fiscalYear: number
  totalDebit: number
  totalCredit: number
}

/** Pengajuan approval penutup tahun (no-op bila workflow tak terkonfigurasi). */
export async function requestYearEndClosingApproval(fiscalYear: number, requestedBy?: number): Promise<boolean> {
  assertValidFiscalYear(fiscalYear)
  return requestApprovalIfConfigured(YEAR_END_CLOSING_REFERENCE_TYPE, fiscalYear, requestedBy)
}

function assertValidFiscalYear(fiscalYear: number): void {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
    throw new Error("Tahun fiskal tidak valid.")
  }
}

function isJournalReferenceConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const rec = error as Record<string, unknown>
  if (rec.code !== "P2002") return false
  const meta = rec.meta as Record<string, unknown> | undefined
  const target = meta ? String(meta.target ?? "") : ""
  const message = error instanceof Error ? error.message : ""
  return /journals_reference_unique|reference/i.test(target) || /reference/i.test(message)
}

/**
 * Resolver Putusan 1: akun laba ditahan dari pengaturan yang SUDAH terkunci
 * di tx pemanggil. Setiap kegagalan = throw berisik, nol jurnal.
 */
export async function resolveRetainedEarningsAccountId(tx: TxClient): Promise<number> {
  const settings = await tx.systemSetting.findFirst({
    select: { retainedEarningsAccountId: true },
  })
  const accountId = settings?.retainedEarningsAccountId ?? null
  if (accountId === null) {
    throw new Error("Akun laba ditahan belum dipetakan di Pengaturan.")
  }
  const account = await tx.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { id: true, name: true, type: true, isActive: true },
  })
  if (!account || !account.isActive) {
    throw new Error("Akun laba ditahan belum dipetakan di Pengaturan.")
  }
  if (account.type !== "EQUITY" || !isRetainedEarningsAccount(account.name)) {
    throw new Error(
      `Akun tujuan penutup "${account.name}" bukan akun ekuitas laba ditahan. Petakan akun laba ditahan di Pengaturan.`,
    )
  }
  return account.id
}

/** Posting jurnal penutup tahun fiskal. Lihat header berkas untuk urutan gerbang. */
export async function postYearEndClosing(fiscalYear: number, userId?: number): Promise<YearEndClosingPostResult> {
  assertValidFiscalYear(fiscalYear)
  // Putusan 4: gerbang approval SEBELUM transaksi posting.
  await assertApproved(YEAR_END_CLOSING_REFERENCE_TYPE, fiscalYear)

  const journalNumber = await generateDocumentNumber("JRN")

  try {
    return await prisma.$transaction(async (tx) => {
      // Baca pengaturan mentah dulu untuk tanggal penutup; baris yang sama
      // dikunci FOR UPDATE oleh assertPeriodOpen(tx) tepat sesudahnya, dan
      // semua bacaan sesudah titik ini memakai tx (snapshot terkunci).
      const rawSettings = await tx.systemSetting.findFirst({
        select: { fiscalYearStartMonth: true },
      })
      const fiscalYearStartMonth = rawSettings?.fiscalYearStartMonth ?? 1
      const { start, end } = fiscalYearPeriod(fiscalYear, fiscalYearStartMonth)

      // (2) Kunci baris system_settings FOR UPDATE + periode tanggal penutup terbuka.
      await assertPeriodOpen(end, tx)

      // (1) Resolver fail-closed atas baris pengaturan yang sudah terkunci.
      const retainedEarningsAccountId = await resolveRetainedEarningsAccountId(tx)

      // (3) Anti-dobel di dalam tx: satu tahun = satu jurnal penutup POSTED aktif.
      const existing = await tx.journal.findFirst({
        where: {
          referenceType: YEAR_END_CLOSING_REFERENCE_TYPE,
          referenceId: fiscalYear,
          status: "POSTED",
          deletedAt: null,
        },
        select: { id: true, journalNumber: true },
      })
      if (existing) {
        throw new Error(
          `Tahun fiskal ${fiscalYear} sudah ditutup oleh jurnal ${existing.journalNumber}. Koreksi hanya lewat reversal jurnal penutup.`,
        )
      }

      // (4)+(5) Saldo dari builder pratinjau yang sama; tak seimbang = tolak.
      const entries = await collectYearEndClosingEntries(tx, start, end)
      const preview = buildYearEndClosingPreview({
        fiscalYear,
        fiscalYearStartMonth,
        retainedEarningsAccountId,
        alreadyClosed: false,
        entries,
      })
      if (!preview.balanced || preview.difference !== 0) {
        throw new Error(
          `Jurnal penutup tahun ${fiscalYear} tidak seimbang (selisih ${preview.difference}); posting dibatalkan, tidak ada jurnal dibuat.`,
        )
      }
      if (preview.lines.length === 0) {
        throw new Error(`Tidak ada saldo akun laba/rugi tahun fiskal ${fiscalYear} yang perlu ditutup.`)
      }

      // (6) Satu Jurnal POSTED: baris penutup + baris lawan per profitCenterId.
      const journal = await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: end,
          referenceType: YEAR_END_CLOSING_REFERENCE_TYPE,
          referenceId: fiscalYear,
          description: `Penutup tahun fiskal ${fiscalYear}`,
          type: "GENERAL",
          status: "POSTED",
          totalDebit: preview.totalDebit,
          totalCredit: preview.totalCredit,
          createdBy: userId ?? null,
        },
      })

      await tx.journalEntry.createMany({
        data: [
          ...preview.lines.map((line) => ({
            journalId: journal.id,
            accountId: line.accountId,
            debit: line.closingDirection === "debit" ? line.closingAmount : 0,
            credit: line.closingDirection === "credit" ? line.closingAmount : 0,
            memo: `Penutup ${line.accountCode} tahun fiskal ${fiscalYear}`,
            profitCenterId: line.profitCenterId,
          })),
          ...preview.retainedLines.map((line) => ({
            journalId: journal.id,
            accountId: retainedEarningsAccountId,
            debit: line.direction === "debit" ? Math.abs(line.netProfit) : 0,
            credit: line.direction === "credit" ? Math.abs(line.netProfit) : 0,
            memo: `Laba ditahan tahun fiskal ${fiscalYear}`,
            profitCenterId: line.profitCenterId,
          })),
        ],
      })

      return {
        journalId: journal.id,
        journalNumber: journal.journalNumber,
        fiscalYear,
        totalDebit: preview.totalDebit,
        totalCredit: preview.totalCredit,
      }
    })
  } catch (error) {
    if (isJournalReferenceConflict(error)) {
      throw new Error(
        `Jurnal penutup tahun fiskal ${fiscalYear} sudah pernah dibuat (termasuk yang sudah di-reversal). Posting ulang menunggu putusan skema anti-dobel; tidak ada jurnal baru dibuat.`,
      )
    }
    throw error
  }
}

/**
 * Reversal penuh jurnal penutup tahun fiskal (Putusan 3). Jurnal asli
 * menjadi REVERSED; jurnal lawan POSTED bertanggal sama dengan asli dan
 * mempertahankan profitCenterId tiap baris. Periode tanggal penutup wajib
 * terbuka di dalam tx yang sama.
 */
export async function reverseYearEndClosing(
  fiscalYear: number,
  userId?: number,
): Promise<{ journalId: number; journalNumber: string; reversalJournalId: number }> {
  assertValidFiscalYear(fiscalYear)
  const reversalNumber = await generateDocumentNumber("JRN")

  return prisma.$transaction(async (tx) => {
    const original = await tx.journal.findFirst({
      where: {
        referenceType: YEAR_END_CLOSING_REFERENCE_TYPE,
        referenceId: fiscalYear,
        status: "POSTED",
        deletedAt: null,
      },
      include: { entries: true },
    })
    if (!original) {
      throw new Error(`Jurnal penutup tahun fiskal ${fiscalYear} tidak ditemukan atau sudah di-reversal.`)
    }

    await assertPeriodOpen(original.transactionDate, tx)

    const reversal = await tx.journal.create({
      data: {
        journalNumber: reversalNumber,
        transactionDate: original.transactionDate,
        referenceType: "Journal",
        referenceId: original.id,
        description: `Reversal jurnal penutup tahun fiskal ${fiscalYear} (${original.journalNumber})`,
        type: original.type,
        status: "POSTED",
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        createdBy: userId ?? null,
      },
    })

    await tx.journalEntry.createMany({
      data: original.entries.map((entry) => ({
        journalId: reversal.id,
        accountId: entry.accountId,
        debit: entry.credit,
        credit: entry.debit,
        memo: `Reversal: ${entry.memo ?? ""}`.trim(),
        profitCenterId: entry.profitCenterId,
      })),
    })

    await tx.journal.update({
      where: { id: original.id },
      data: { status: "REVERSED" },
    })

    return { journalId: original.id, journalNumber: original.journalNumber, reversalJournalId: reversal.id }
  })
}
