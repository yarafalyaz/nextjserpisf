"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { buildAdvanceJournalEntries } from "@/lib/finance/purchase-advance"
import { logActivity } from "@/lib/services/activity-log.service"
import { DocumentSequenceService } from "@/lib/services/document-sequence.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug } from "@/lib/utils/slug-db"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { parseFormData } from "@/lib/validations/parse-form"
import { purchaseAdvanceSchema } from "@/lib/validations/finance.schemas"

const REVALIDATE = "/pembelian/uang-muka"

export interface PurchaseAdvanceActionResult {
  success: boolean
  error?: string
  id?: number
  slug?: string | null
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

export async function createPurchaseAdvance(formData: FormData): Promise<PurchaseAdvanceActionResult> {
  try {
    const user = await requirePermission("create_purchase_advances")

    const parsed = parseFormData(purchaseAdvanceSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Tengah malam UTC untuk hari kalender WIB — bukan `new Date(...)`
    // yang bergantung pada zona waktu proses.
    const date = wibDateToUtcMidnight(v.date)

    const vendorId = v.vendorId
    const amount = v.amount
    const paymentAccountId = v.paymentAccountId
    const advanceAccountId = v.advanceAccountId
    const description = v.description ?? null

    await assertPeriodOpen(date)

    const [vendor, accounts] = await Promise.all([
      prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true, name: true } }),
      prisma.account.findMany({
        where: { id: { in: [paymentAccountId, advanceAccountId] } },
        select: { id: true },
      }),
    ])
    if (!vendor) return { success: false, error: "Pemasok tidak ditemukan." }
    if (accounts.length !== 2) return { success: false, error: "Akun yang dipilih tidak ditemukan." }

    const documentNo = await generateDocumentNumber("DP", "simple")
    const [sequence] = await DocumentSequenceService.nextBatch("JOURNAL", 1)
    const journalNumber = `JRN-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${String(sequence).padStart(5, "0")}`

    const entries = buildAdvanceJournalEntries({
      amount,
      advanceAccountId,
      paymentAccountId,
      vendorName: vendor.name,
      documentNo,
    })

    const created = await prisma.$transaction(async (tx) => {
      const advance = await tx.purchaseAdvance.create({
        data: {
          slug: await nextSlug("purchaseAdvance", documentNo),
          documentNo,
          date,
          vendorId,
          amount: toMoney(amount),
          paymentAccountId,
          advanceAccountId,
          description,
          createdBy: Number(user.id),
        },
      })

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          slug: await nextSlug("journal", journalNumber),
          transactionDate: date,
          description: description ?? `Uang muka pembelian ${documentNo} — ${vendor.name}`,
          type: "PURCHASE_ADVANCE",
          status: "POSTED",
          totalDebit: toMoney(amount),
          totalCredit: toMoney(amount),
          referenceType: "PurchaseAdvance",
          referenceId: advance.id,
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

      await tx.purchaseAdvance.update({ where: { id: advance.id }, data: { journalId: journal.id } })
      return advance
    })

    await logActivity("create", "PurchaseAdvance", created.id, `Uang muka pembelian ${documentNo}`)
    revalidatePath(REVALIDATE)

    return { success: true, id: created.id, slug: created.slug }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createPurchaseAdvance failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan uang muka pembelian.") }
  }
}

/**
 * Menghapus uang muka beserta jurnalnya — jalur koreksi, bukan pembatalan resmi.
 * Dijaga kunci periode supaya periode tertutup tidak berubah diam-diam.
 */
export async function deletePurchaseAdvance(id: number): Promise<PurchaseAdvanceActionResult> {
  try {
    await requirePermission("delete_purchase_advances")

    const advance = await prisma.purchaseAdvance.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, date: true, journalId: true },
    })
    if (!advance) return { success: false, error: "Uang muka tidak ditemukan." }

    await assertPeriodOpen(advance.date)

    await prisma.$transaction(async (tx) => {
      if (advance.journalId) {
        await tx.journalEntry.deleteMany({ where: { journalId: advance.journalId } })
        await tx.transactionAttachment.deleteMany({ where: { referenceType: "Journal", referenceId: advance.journalId } })
        await tx.journal.delete({ where: { id: advance.journalId } })
      }
      await tx.purchaseAdvance.delete({ where: { id } })
    })

    await logActivity("delete", "PurchaseAdvance", id, `Menghapus uang muka pembelian ${advance.documentNo}`)
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deletePurchaseAdvance failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus uang muka pembelian.") }
  }
}
