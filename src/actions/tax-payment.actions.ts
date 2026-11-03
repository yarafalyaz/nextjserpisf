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
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { wibYearMonthCompact } from "@/lib/utils/date-only"
import { parseFormData } from "@/lib/validations/parse-form"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { taxPaymentSchema } from "@/lib/validations/finance.schemas"
import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"

const REVALIDATE = "/keuangan/penyetoran-pajak"

export interface TaxPaymentActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

export async function createTaxPayment(formData: FormData): Promise<TaxPaymentActionResult> {
  try {
    const user = await requirePermission("create_tax_payments")

    const idempotencyKey = formData.get("idempotencyKey") as string | null

    const parsed = parseFormData(taxPaymentSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Tengah malam UTC untuk hari kalender WIB — bukan `new Date(...)`
    // yang bergantung pada zona waktu proses.
    const date = wibDateToUtcMidnight(v.date)

    const amount = v.amount

    const taxAccountId = v.taxAccountId
    const paymentAccountId = v.paymentAccountId
    if (taxAccountId === paymentAccountId) {
      return { success: false, error: "Akun utang pajak dan kas/bank tidak boleh sama." }
    }

    const taxTypeId = v.taxTypeId
    const rawPeriod = v.period
    const reference = v.reference ?? null
    const notes = v.notes ?? null

    await assertPeriodOpen(date)

    const [accounts, taxType] = await Promise.all([
      prisma.account.findMany({ where: { id: { in: [taxAccountId, paymentAccountId] } }, select: { id: true, isActive: true, deletedAt: true, type: true, reportGroup: true } }),
      taxTypeId
        ? prisma.withholdingTaxType.findUnique({ where: { id: taxTypeId }, select: { name: true, isActive: true, deletedAt: true } })
        : Promise.resolve(null),
    ])
    if (accounts.length !== 2) return { success: false, error: "Akun yang dipilih tidak ditemukan." }
    if (accounts.some((account) => account.deletedAt != null)) {
      return { success: false, error: "Akun yang dipilih sudah dihapus." }
    }
    if (accounts.some((account) => !account.isActive)) {
      return { success: false, error: "Akun yang dipilih tidak aktif." }
    }
    const outerTax = accounts.find((a) => a.id === taxAccountId)
    const outerPay = accounts.find((a) => a.id === paymentAccountId)
    if (outerTax?.type !== "LIABILITY") {
      return { success: false, error: "Akun utang pajak bukan akun kewajiban (LIABILITY)." }
    }
    if (outerPay?.reportGroup !== "BANK") {
      return { success: false, error: "Akun pembayaran bukan rekening kas/bank (grup laporan BANK)." }
    }
    if (taxTypeId && !taxType) return { success: false, error: "Jenis pemotongan tidak ditemukan." }
    // R8-PAJAK-08: pembayaran pajak untuk jenis nonaktif/terhapus ditolak.
    if (taxType && (taxType.deletedAt != null || taxType.isActive === false)) {
      return { success: false, error: "Jenis pemotongan nonaktif atau sudah dihapus." }
    }

    const label = taxType?.name ?? "pajak"
    const documentNo = await generateDocumentNumber("PAJAK", "simple")
    const [sequence] = await DocumentSequenceService.nextBatch("JOURNAL", 1)
    // Putaran 102: prefiks bulan dari hari kalender WIB. `date` adalah tengah
    // malam UTC hari WIB, jadi getter lokal proses menulis setoran 1 Nov
    // sebagai JRN-202610 di runtime barat UTC — nomor tidak cocok dengan masa
    // dokumennya dan bertabrakan dengan namespace bulan sebelumnya.
    const journalNumber = `JRN-${wibYearMonthCompact(date)}-${String(sequence).padStart(5, "0")}`

    const entries = buildTaxPaymentJournalEntries({
      amount,
      taxAccountId,
      paymentAccountId,
      label,
      documentNo,
    })

    const created = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)
      // Penjaga periode otoritatif di DALAM tx (pola void): cek luar hanya
      // fast-fail; tutup-periode tidak bisa menyelip di antara cek dan tulis.
      await assertPeriodOpen(date, tx)

      // Nilai ulang R8-PAJAK-08 di DALAM tx di bawah kunci baris: cek luar
      // adalah snapshot lepas, jadi jenis pajak yang dinonaktifkan/dihapus
      // (atau akun yang hilang) di antara cek dan create tetap melahirkan
      // TaxPayment + jurnal POSTED untuk jenis nonaktif.
      if (taxTypeId) {
        await tx.$executeRaw`SELECT id FROM withholding_tax_types WHERE id = ${taxTypeId} FOR UPDATE`
        const freshType = await tx.withholdingTaxType.findUnique({
          where: { id: taxTypeId },
          select: { isActive: true, deletedAt: true },
        })
        if (!freshType) throw new Error("Jenis pemotongan tidak ditemukan.")
        if (freshType.deletedAt != null || freshType.isActive === false) {
          throw new Error("Jenis pemotongan nonaktif atau sudah dihapus.")
        }
      }
      // Nilai ulang akun DI DALAM tx di bawah kunci baris (pola bank-transfer):
      // cek luar hanyalah snapshot — akun yang dinonaktifkan/dihapus sesudah
      // picker dimuat, atau akun salah jenis dari panggilan langsung, tidak
      // boleh menerima jurnal POSTED setoran. taxAccount wajib LIABILITY,
      // paymentAccount wajib kas/bank (reportGroup BANK) sesuai halaman tambah.
      const sortedAccountIds = [taxAccountId, paymentAccountId].sort((a, b) => a - b)
      await tx.$executeRaw`SELECT id FROM accounts WHERE id IN (${Prisma.join(sortedAccountIds)}) FOR UPDATE`
      const freshAccounts = await tx.account.findMany({
        where: { id: { in: [taxAccountId, paymentAccountId] } },
        select: { id: true, isActive: true, deletedAt: true, type: true, reportGroup: true, _count: { select: { children: true } } },
      })
      if (freshAccounts.length !== 2) throw new Error("Akun yang dipilih tidak ditemukan.")
      if (freshAccounts.some((account) => account.deletedAt != null)) {
        throw new Error("Akun yang dipilih sudah dihapus.")
      }
      if (freshAccounts.some((account) => !account.isActive)) {
        throw new Error("Akun yang dipilih tidak aktif.")
      }
      // Putaran 100: akun induk tidak bisa menerima jurnal POSTED
      // (journal.service); jurnal setoran pajak dibuat langsung POSTED.
      if (freshAccounts.some((account) => (account._count?.children ?? 0) > 0)) {
        throw new Error("Akun induk tidak bisa diposting. Pilih akun anak yang terposting.")
      }
      const freshTax = freshAccounts.find((a) => a.id === taxAccountId)
      const freshPay = freshAccounts.find((a) => a.id === paymentAccountId)
      if (freshTax?.type !== "LIABILITY") {
        throw new Error("Akun utang pajak bukan akun kewajiban (LIABILITY).")
      }
      if (freshPay?.reportGroup !== "BANK") {
        throw new Error("Akun pembayaran bukan rekening kas/bank (grup laporan BANK).")
      }

      const payment = await tx.taxPayment.create({
        data: {
          // R8-PAJAK-09: slug dicek lewat tx (nextSlug global tidak melihat
          // baris tak-tercommit transaksi lain → race slug konkuren).
          slug: await nextSlugWithClient(tx as never, "taxPayment", documentNo),
          documentNo,
          date,
          period: rawPeriod || null,
          taxTypeId: taxTypeId ?? null,
          // F-005: billing/NTPN/jenis terstruktur; kosong = setor legacy.
          billingCode: v.billingCode ?? null,
          ntpn: v.ntpn ?? null,
          taxKind: v.taxKind ?? null,
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
          slug: await nextSlugWithClient(tx as never, "journal", journalNumber),
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

/**
 * GL-BR-003 P5 (vonis t_16159d89 V-P5/P6-1, V-P5/P6-3, V-P5/P6-4): void berstatus
 * setor pajak posted. Hard-delete jurnal POSTED + hapus fisik DILARANG —
 * koreksi sah: jurnal lawan cermin lewat reverseJournalsByReferenceTx (refType
 * persis "TaxPayment") + baris dipertahankan status "void" + deletedAt.
 * TaxPayment ber-NTPN TERKUNCI dari void (setor riil di DJP; salah klasifikasi
 * ditangani jurnal reklasifikasi, bukan pembatalan). billingCode tanpa NTPN
 * tidak mengunci. Lampiran TIDAK dihapus. Alasan void wajib.
 */
export async function deleteTaxPayment(id: number, reason?: string): Promise<TaxPaymentActionResult> {
  try {
    const user = await requirePermission("delete_tax_payments")
    const cleanReason = (reason ?? "").trim()
    if (!cleanReason) {
      return { success: false, error: "Alasan pembatalan penyetoran pajak wajib diisi." }
    }

    let documentNo = ""
    await prisma.$transaction(async (tx) => {
      // Kunci baris + baca ulang di dalam tx (pola deleteSalesPayment).
      await tx.$executeRaw`SELECT id FROM tax_payments WHERE id = ${id} FOR UPDATE`
      const payment = await tx.taxPayment.findUniqueOrThrow({ where: { id } })
      if (payment.deletedAt || payment.status === "void") {
        throw new Error("Penyetoran pajak ini sudah dibatalkan.")
      }
      // V-P5/P6-4: NTPN terisi = setor riil di luar sistem — void memalsukan
      // posisi kas dan utang pajak.
      if (payment.ntpn) {
        throw new Error(
          "Setoran ini sudah memiliki NTPN (setor riil ke kas negara) sehingga tidak dapat dibatalkan. Salah klasifikasi akun ditangani lewat jurnal koreksi reklasifikasi oleh akuntan.",
        )
      }
      documentNo = payment.documentNo

      await assertPeriodOpen(payment.date, tx)

      await reverseJournalsByReferenceTx(tx, "TaxPayment", id, cleanReason, Number(user.id))

      await tx.taxPayment.update({
        where: { id },
        data: {
          status: "void",
          deletedAt: new Date(),
        },
      })
    })

    await logActivity("void", "TaxPayment", id, `Membatalkan penyetoran pajak ${documentNo}: ${cleanReason}`)
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteTaxPayment failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus penyetoran pajak.") }
  }
}
