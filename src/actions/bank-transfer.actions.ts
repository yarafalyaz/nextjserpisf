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
import { parseMoneyAmount } from "@/lib/utils/parse-money"
import { deleteTransactionAttachmentsTx, removeAttachmentFiles } from "@/lib/services/transaction-attachment.service"

const REVALIDATE = "/keuangan/transfer-bank"

function parseId(raw: FormDataEntryValue | null): number | null {
  const value = Number(String(raw ?? ""))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

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

    const dateRaw = String(formData.get("date") ?? "")
    const date = new Date(dateRaw)
    if (!dateRaw || Number.isNaN(date.getTime())) {
      return { success: false, error: "Tanggal transfer tidak valid." }
    }

    const fromAccountId = parseId(formData.get("fromAccountId"))
    const toAccountId = parseId(formData.get("toAccountId"))
    if (!fromAccountId || !toAccountId) {
      return { success: false, error: "Rekening asal dan rekening tujuan wajib dipilih." }
    }
    if (fromAccountId === toAccountId) {
      return { success: false, error: "Rekening asal dan tujuan tidak boleh sama." }
    }

    const amount = parseMoneyAmount(formData.get("amount"))
    if (amount === null || amount <= 0) {
      return { success: false, error: "Nominal transfer harus lebih dari 0." }
    }

    const adminFee = parseMoneyAmount(formData.get("adminFee")) ?? 0
    if (adminFee < 0) {
      return { success: false, error: "Biaya admin tidak boleh negatif." }
    }

    const feeAccountId = parseId(formData.get("feeAccountId"))
    if (adminFee > 0 && !feeAccountId) {
      return {
        success: false,
        error: "Akun beban biaya admin wajib dipilih bila biaya admin lebih dari 0.",
      }
    }

    const description = (formData.get("description") as string)?.trim() || null

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
 * Hapus transfer beserta jurnalnya.
 *
 * Ini **jalur koreksi** (transfer salah rekening/nominal): jurnal tidak
 * dibiarkan menggantung, jadi keduanya dihapus bersama dalam satu transaksi.
 * Periode yang sudah ditutup menolak penghapusan; setelah periode terkunci,
 * koreksinya harus lewat jurnal pembalik manual.
 */
export async function deleteBankTransfer(id: number) {
  try {
    await requirePermission("delete_bank_transfers")

    const transfer = await prisma.bankTransfer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, date: true, journalId: true },
    })
    if (!transfer) return { success: false, error: "Transfer tidak ditemukan." }

    await assertPeriodOpen(transfer.date)

    let removedFiles: { fileUrl: string; referenceType: string }[] = []
    await prisma.$transaction(async (tx) => {
      if (transfer.journalId) {
        removedFiles = await deleteTransactionAttachmentsTx(tx, {
          referenceType: "Journal", referenceId: transfer.journalId,
        })
        await tx.journalEntry.deleteMany({ where: { journalId: transfer.journalId } })
        await tx.journal.delete({ where: { id: transfer.journalId } })
      }
      await tx.bankTransfer.delete({ where: { id: transfer.id } })
    })
    await removeAttachmentFiles(removedFiles)

    await logActivity("delete", "BankTransfer", id, `Menghapus transfer antar rekening ${transfer.documentNo}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBankTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
