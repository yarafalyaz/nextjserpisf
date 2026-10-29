"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug } from "@/lib/utils/slug-db"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { DocumentSequenceService } from "@/lib/services/document-sequence.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { parseFormData } from "@/lib/validations/parse-form"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { bankTransferSchema } from "@/lib/validations/finance.schemas"
import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"

const REVALIDATE = "/keuangan/transfer-bank"

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

/**
 * Transfer antar rekening kas/bank: satu dokumen + satu jurnal yang langsung
 * POSTED.
 *
 * Jurnalnya sengaja dibuat dalam transaksi yang sama dengan dokumennya supaya
 * tidak mungkin ada transfer tanpa jurnal (atau sebaliknya). Bentuk jurnalnya:
 *   Dr Rekening tujuan (amount)
 *   Dr Beban biaya admin (adminFee)     — bila ada
 *   Cr Rekening asal (amount + adminFee)
 * Kas berkurang sebesar amount + biaya, tujuan menerima amount, selisihnya jadi
 * beban — jadi saldo rekening cocok dengan mutasi bank.
 */
export async function createBankTransfer(formData: FormData) {
  try {
    const user = await requirePermission("create_bank_transfers")

    const idempotencyKey = formData.get("idempotencyKey") as string | null

    const parsed = parseFormData(bankTransferSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Tengah malam UTC untuk hari kalender WIB — bukan `new Date(...)`
    // yang bergantung pada zona waktu proses.
    const date = wibDateToUtcMidnight(v.date)

    const fromAccountId = v.fromAccountId
    const toAccountId = v.toAccountId

    const amount = v.amount

    const adminFee = v.adminFee

    const feeAccountId = v.feeAccountId

    const description = v.description ?? null

    await assertPeriodOpen(date)

    const accountIds = [fromAccountId, toAccountId, ...(feeAccountId ? [feeAccountId] : [])]
    const found = await prisma.account.count({ where: { id: { in: accountIds } } })
    if (found !== new Set(accountIds).size) {
      return { success: false, error: "Rekening/akun yang dipilih tidak ditemukan." }
    }

    const documentNo = await generateDocumentNumber("BTF", "simple")
    const [seq] = await DocumentSequenceService.nextBatch("JOURNAL", 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const journalNumber = `JRN-${year}${month}-${String(seq).padStart(5, "0")}`

    const totalMovement = amount + adminFee

    const transfer = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)

      const created = await tx.bankTransfer.create({
        data: {
          documentNo,
          slug: await nextSlug("bankTransfer", documentNo),
          date,
          fromAccountId,
          toAccountId,
          amount: decimal(amount),
          adminFee: decimal(adminFee),
          feeAccountId: feeAccountId ?? null,
          description,
          createdBy: Number(user.id),
        },
      })

      const entries = [
        {
          accountId: toAccountId,
          debit: decimal(amount),
          credit: decimal(0),
          memo: `Transfer masuk dari rekening asal (${documentNo})`,
        },
        ...(adminFee > 0 && feeAccountId
          ? [
              {
                accountId: feeAccountId,
                debit: decimal(adminFee),
                credit: decimal(0),
                memo: `Biaya admin transfer (${documentNo})`,
              },
            ]
          : []),
        {
          accountId: fromAccountId,
          debit: decimal(0),
          credit: decimal(totalMovement),
          memo: `Transfer keluar + biaya admin (${documentNo})`,
        },
      ]

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          slug: await nextSlug("journal", journalNumber),
          transactionDate: date,
          description: description ?? `Transfer antar rekening ${documentNo}`,
          type: "TRANSFER",
          status: "POSTED",
          totalDebit: decimal(totalMovement),
          totalCredit: decimal(totalMovement),
          referenceType: "BANK_TRANSFER",
          referenceId: created.id,
          createdBy: Number(user.id),
          entries: { create: entries },
        },
      })

      await tx.bankTransfer.update({
        where: { id: created.id },
        data: { journalId: journal.id },
      })

      return created
    })

    await logActivity("create", "BankTransfer", transfer.id, `Transfer antar rekening ${documentNo}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: transfer.id, slug: transfer.slug }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBankTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * GL-BR-003 P5 (vonis t_16159d89 V-P5/P6-1, V-P5/P6-3): void berstatus transfer
 * posted. Hard-delete jurnal POSTED + hapus fisik DILARANG — koreksi sah:
 * jurnal lawan cermin lewat reverseJournalsByReferenceTx (refType persis
 * "BANK_TRANSFER") + baris dipertahankan status "void" + deletedAt.
 * Lampiran TIDAK dihapus (bukti audit). Alasan void wajib.
 * Recon guard (rekomendasi 6): entri jurnal asal yang sudah matched pada
 * rekonsiliasi final (completed) tidak boleh di-REVERSED diam-diam — tolak
 * dan arahkan ke pembatalan rekonsiliasi dulu.
 */
export async function deleteBankTransfer(id: number, reason?: string) {
  try {
    const user = await requirePermission("delete_bank_transfers")
    const cleanReason = (reason ?? "").trim()
    if (!cleanReason) {
      return { success: false, error: "Alasan pembatalan transfer wajib diisi." }
    }

    let documentNo = ""
    await prisma.$transaction(async (tx) => {
      // Kunci baris + baca ulang di dalam tx (pola deleteSalesPayment).
      await tx.$executeRaw`SELECT id FROM bank_transfers WHERE id = ${id} FOR UPDATE`
      const transfer = await tx.bankTransfer.findUniqueOrThrow({ where: { id } })
      if (transfer.deletedAt || transfer.status === "void") {
        throw new Error("Transfer ini sudah dibatalkan.")
      }
      documentNo = transfer.documentNo

      await assertPeriodOpen(transfer.date, tx)

      if (transfer.journalId) {
        // Recon guard: entri jurnal transfer yang sudah dipakai item
        // rekonsiliasi final (completed) tidak boleh di-REVERSED diam-diam.
        const linkedEntryIds = await tx.journalEntry.findMany({
          where: { journalId: transfer.journalId },
          select: { id: true },
        })
        if (linkedEntryIds.length > 0) {
          const matched = await tx.bankReconciliationItem.findFirst({
            where: {
              journalEntryId: { in: linkedEntryIds.map((e) => e.id) },
              matched: true,
              bankReconciliation: { status: "completed" },
            },
            select: { id: true },
          })
          if (matched) {
            throw new Error(
              "Transfer ini sudah cocok pada rekonsiliasi bank final. Batalkan rekonsiliasi terlebih dahulu sebelum membatalkan transfer.",
            )
          }
        }
      }

      await reverseJournalsByReferenceTx(tx, "BANK_TRANSFER", id, cleanReason, Number(user.id))

      await tx.bankTransfer.update({
        where: { id },
        data: {
          status: "void",
          voidAt: new Date(),
          voidReason: cleanReason,
          deletedAt: new Date(),
        },
      })
    })

    await logActivity("void", "BankTransfer", id, `Membatalkan transfer antar rekening ${documentNo}: ${cleanReason}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBankTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
