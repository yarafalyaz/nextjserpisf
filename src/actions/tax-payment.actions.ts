"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { buildTaxPaymentJournalEntries } from "@/lib/finance/tax-payment"
import { logActivity } from "@/lib/services/activity-log.service"
import { DocumentSequenceService } from "@/lib/services/document-sequence.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug } from "@/lib/utils/slug-db"
import { parseMoneyAmount } from "@/lib/utils/parse-money"
import { deleteTransactionAttachmentsTx, removeAttachmentFiles } from "@/lib/services/transaction-attachment.service"

const REVALIDATE = "/keuangan/penyetoran-pajak"

export interface TaxPaymentActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  return parseMoneyAmount(raw)
}

function parseId(raw: FormDataEntryValue | null): number | null {
  const value = Number(String(raw ?? ""))
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * Masa pajak `YYYY-MM` yang benar-benar ada di kalender.
 *
 * Regex saja tidak cukup: `/^\d{4}-\d{2}$/` meloloskan "2026-13"/"2026-00"
 * yang lalu tersimpan sebagai masa pajak fiktif dan tercetak mentah di
 * laporan penyetoran pajak. Bulan wajib 01–12.
 */
export function isValidTaxPeriod(raw: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(raw)) return false
  const month = Number(raw.slice(5, 7))
  return month >= 1 && month <= 12
}

export async function createTaxPayment(formData: FormData): Promise<TaxPaymentActionResult> {
  try {
    const user = await requirePermission("create_tax_payments")

    const rawDate = String(formData.get("date") ?? "").trim()
    const date = new Date(`${rawDate}T00:00:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(date.getTime())) {
      return { success: false, error: "Tanggal setor tidak valid." }
    }

    const amount = parseAmount(formData.get("amount"))
    if (amount === null || amount <= 0) return { success: false, error: "Jumlah setor harus lebih dari 0." }

    const taxAccountId = parseId(formData.get("taxAccountId"))
    const paymentAccountId = parseId(formData.get("paymentAccountId"))
    if (!taxAccountId || !paymentAccountId) {
      return { success: false, error: "Akun utang pajak dan akun kas/bank wajib dipilih." }
    }
    if (taxAccountId === paymentAccountId) {
      return { success: false, error: "Akun utang pajak dan kas/bank tidak boleh sama." }
    }

    const taxTypeId = parseId(formData.get("taxTypeId"))
    const rawPeriod = String(formData.get("period") ?? "").trim()
    if (rawPeriod && !isValidTaxPeriod(rawPeriod)) {
      return { success: false, error: "Masa pajak harus dalam format YYYY-MM, mis. 2026-09." }
    }
    const reference = String(formData.get("reference") ?? "").trim() || null
    const notes = String(formData.get("notes") ?? "").trim() || null

    await assertPeriodOpen(date)

    const [accounts, taxType] = await Promise.all([
      prisma.account.findMany({ where: { id: { in: [taxAccountId, paymentAccountId] } }, select: { id: true } }),
      taxTypeId ? prisma.withholdingTaxType.findUnique({ where: { id: taxTypeId }, select: { name: true } }) : Promise.resolve(null),
    ])
    if (accounts.length !== 2) return { success: false, error: "Akun yang dipilih tidak ditemukan." }
    if (taxTypeId && !taxType) return { success: false, error: "Jenis pemotongan tidak ditemukan." }

    const label = taxType?.name ?? "pajak"
    const documentNo = await generateDocumentNumber("PAJAK", "simple")
    const [sequence] = await DocumentSequenceService.nextBatch("JOURNAL", 1)
    const journalNumber = `JRN-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${String(sequence).padStart(5, "0")}`

    const entries = buildTaxPaymentJournalEntries({
      amount,
      taxAccountId,
      paymentAccountId,
      label,
      documentNo,
    })

    const created = await prisma.$transaction(async (tx) => {
      const payment = await tx.taxPayment.create({
        data: {
          slug: await nextSlug("taxPayment", documentNo),
          documentNo,
          date,
          period: rawPeriod || null,
          taxTypeId: taxTypeId ?? null,
          taxAccountId,
          paymentAccountId,
          amount: toMoney(amount),
          reference,
          notes,
          createdBy: Number(user.id),
        },
      })

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          slug: await nextSlug("journal", journalNumber),
          transactionDate: date,
          description: notes ?? `Penyetoran ${label} ${documentNo}`,
          type: "TAX_PAYMENT",
          status: "POSTED",
          totalDebit: toMoney(amount),
          totalCredit: toMoney(amount),
          referenceType: "TaxPayment",
          referenceId: payment.id,
          createdBy: Number(user.id),
          entries: {
            create: entries.map((entry) => ({
              accountId: entry.accountId,
              debit: toMoney(entry.debit),
              credit: toMoney(entry.credit),
              memo: entry.memo,
            })),
          },
        },
      })

      await tx.taxPayment.update({ where: { id: payment.id }, data: { journalId: journal.id } })
      return payment
    })

    await logActivity("create", "TaxPayment", created.id, `Penyetoran pajak ${documentNo}`)
    revalidatePath(REVALIDATE)

    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createTaxPayment failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan penyetoran pajak.") }
  }
}

export async function deleteTaxPayment(id: number): Promise<TaxPaymentActionResult> {
  try {
    await requirePermission("delete_tax_payments")

    const payment = await prisma.taxPayment.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, date: true, journalId: true },
    })
    if (!payment) return { success: false, error: "Penyetoran pajak tidak ditemukan." }

    await assertPeriodOpen(payment.date)

    let removedFiles: { fileUrl: string; referenceType: string }[] = []
    await prisma.$transaction(async (tx) => {
      if (payment.journalId) {
        await tx.journalEntry.deleteMany({ where: { journalId: payment.journalId } })
        removedFiles = await deleteTransactionAttachmentsTx(tx, { referenceType: "Journal", referenceId: payment.journalId })
        await tx.journal.delete({ where: { id: payment.journalId } })
      }
      await tx.taxPayment.delete({ where: { id } })
    })
    await removeAttachmentFiles(removedFiles)

    await logActivity("delete", "TaxPayment", id, `Menghapus penyetoran pajak ${payment.documentNo}`)
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteTaxPayment failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus penyetoran pajak.") }
  }
}
