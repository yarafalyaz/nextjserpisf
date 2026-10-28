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
import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"

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

/**
 * Mencatat uang muka pembelian + jurnalnya (Dr Uang Muka, Cr Kas/Bank).
 *
 * Dua hal yang sengaja ditolak lebih awal: tanggal di periode yang sudah dikunci
 * (`assertPeriodOpen`) dan rekening/akun yang tidak ada — supaya jurnal tidak
 * pernah lahir dengan akun yang tak terpetakan.
 */
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
 * GL-BR-003 P5 (vonis t_16159d89 V-P5/P6-1, V-P5/P6-3): void berstatus uang muka
 * posted. Hard-delete jurnal POSTED + hapus fisik DILARANG — koreksi sah:
 * jurnal lawan cermin lewat reverseJournalsByReferenceTx (refType persis
 * "PurchaseAdvance") + baris dipertahankan status "void" + deletedAt.
 * Lampiran TIDAK dihapus (bukti audit). Alasan void wajib.
 * Penjaga kondisional masa depan (rekomendasi 3): bila penerapan uang muka ke
 * tagihan vendor dibangun, void wajib menolak uang muka yang sudah diterapkan
 * sebagian/seluruhnya — cantum di sini sampai penerapannya lahir.
 */
export async function deletePurchaseAdvance(id: number, reason?: string): Promise<PurchaseAdvanceActionResult> {
  try {
    const user = await requirePermission("delete_purchase_advances")
    const cleanReason = (reason ?? "").trim()
    if (!cleanReason) {
      return { success: false, error: "Alasan pembatalan uang muka wajib diisi." }
    }

    let documentNo = ""
    await prisma.$transaction(async (tx) => {
      // Kunci baris + baca ulang di dalam tx (pola deleteSalesPayment).
      await tx.$executeRaw`SELECT id FROM purchase_advances WHERE id = ${id} FOR UPDATE`
      const advance = await tx.purchaseAdvance.findUniqueOrThrow({ where: { id } })
      if (advance.deletedAt || advance.status === "void") {
        throw new Error("Uang muka ini sudah dibatalkan.")
      }
      documentNo = advance.documentNo

      await assertPeriodOpen(advance.date, tx)

      await reverseJournalsByReferenceTx(tx, "PurchaseAdvance", id, cleanReason, Number(user.id))

      await tx.purchaseAdvance.update({
        where: { id },
        data: {
          status: "void",
          deletedAt: new Date(),
        },
      })
    })

    await logActivity("void", "PurchaseAdvance", id, `Membatalkan uang muka pembelian ${documentNo}: ${cleanReason}`)
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deletePurchaseAdvance failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus uang muka pembelian.") }
  }
}
