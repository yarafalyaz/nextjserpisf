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
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { wibYearMonthCompact } from "@/lib/utils/date-only"
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
    const idempotencyKey = formData.get("idempotencyKey") as string | null

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
      prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true, name: true, isActive: true, deletedAt: true } }),
      prisma.account.findMany({
        where: { id: { in: [paymentAccountId, advanceAccountId] } },
        select: { id: true, type: true, reportGroup: true, isActive: true, deletedAt: true },
      }),
    ])
    if (!vendor) return { success: false, error: "Pemasok tidak ditemukan." }
    if (!vendor.isActive) return { success: false, error: "Pemasok tidak aktif." }
    if (accounts.length !== 2) return { success: false, error: "Akun yang dipilih tidak ditemukan." }
    // R8-KEU-03: direct call bisa memilih akun nonaktif/terhapus atau bukan
    // kelompok yang dijanjikan label form; daftar pilihan halaman sudah
    // menyaring ini, jadi jalurnya tidak jauh lebih mudah disalahgunakan.
    if (accounts.some((account) => !account.isActive || account.deletedAt)) {
      return { success: false, error: "Akun yang dipilih nonaktif atau sudah dihapus." }
    }
    const paymentAccount = accounts.find((account) => account.id === paymentAccountId)
    const advanceAccount = accounts.find((account) => account.id === advanceAccountId)
    if (paymentAccount?.reportGroup !== "BANK" || advanceAccount?.type !== "ASSET") {
      return { success: false, error: "Akun kas/bank atau akun uang muka tidak sesuai." }
    }

    const documentNo = await generateDocumentNumber("DP", "simple")
    const [sequence] = await DocumentSequenceService.nextBatch("JOURNAL", 1)
    // Putaran 102: prefiks bulan dari hari kalender WIB (lihat tax-payment).
    const journalNumber = `JRN-${wibYearMonthCompact(date)}-${String(sequence).padStart(5, "0")}`

    const entries = buildAdvanceJournalEntries({
      amount,
      advanceAccountId,
      paymentAccountId,
      vendorName: vendor.name,
      documentNo,
    })

    const created = await prisma.$transaction(async (tx) => {
      // R8-KEU-03: pencipta uang — klaim kunci idempotency di dalam tx agar
      // rollback melepas kunci dan submit ulang/replay tidak melahirkan jurnal
      // kedua.
      await checkIdempotency(idempotencyKey, tx, user.id)
      // Penjaga periode otoritatif di DALAM tx (pola void): cek luar hanya
      // fast-fail; tutup-periode tidak bisa menyelip di antara cek dan tulis.
      await assertPeriodOpen(date, tx)

      // Nilai ulang vendor + akun DI DALAM tx di bawah kunci baris (pola
      // bank-transfer/setor pajak): cek luar R8-KEU-03 adalah snapshot —
      // vendor/akun yang dinonaktifkan atau diubah jenisnya di jendela
      // cek->tulis tidak boleh menerima jurnal POSTED uang muka.
      await tx.$executeRaw`SELECT id FROM vendors WHERE id = ${vendorId} FOR UPDATE`
      const freshVendor = await tx.vendor.findFirst({
        where: { id: vendorId, deletedAt: null },
        select: { id: true, isActive: true, deletedAt: true },
      })
      if (!freshVendor) throw new Error("Pemasok tidak ditemukan.")
      if (!freshVendor.isActive) throw new Error("Pemasok tidak aktif.")
      const sortedAccountIds = [paymentAccountId, advanceAccountId].sort((a, b) => a - b)
      await tx.$executeRaw`SELECT id FROM accounts WHERE id IN (${Prisma.join(sortedAccountIds)}) FOR UPDATE`
      const freshAccounts = await tx.account.findMany({
        where: { id: { in: [paymentAccountId, advanceAccountId] } },
        select: { id: true, type: true, reportGroup: true, isActive: true, deletedAt: true, _count: { select: { children: true } } },
      })
      if (freshAccounts.length !== 2) throw new Error("Akun yang dipilih tidak ditemukan.")
      if (freshAccounts.some((account) => !account.isActive || account.deletedAt)) {
        throw new Error("Akun yang dipilih nonaktif atau sudah dihapus.")
      }
      // Putaran 100: akun induk tidak bisa menerima jurnal POSTED
      // (journal.service); jurnal uang muka dibuat langsung POSTED.
      if (freshAccounts.some((account) => (account._count?.children ?? 0) > 0)) {
        throw new Error("Akun induk tidak bisa diposting. Pilih akun anak yang terposting.")
      }
      const freshPayment = freshAccounts.find((account) => account.id === paymentAccountId)
      const freshAdvance = freshAccounts.find((account) => account.id === advanceAccountId)
      if (freshPayment?.reportGroup !== "BANK" || freshAdvance?.type !== "ASSET") {
        throw new Error("Akun kas/bank atau akun uang muka tidak sesuai.")
      }

      const advance = await tx.purchaseAdvance.create({
        data: {
          slug: await nextSlugWithClient(tx as never, "purchaseAdvance", documentNo),
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
          slug: await nextSlugWithClient(tx as never, "journal", journalNumber),
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
