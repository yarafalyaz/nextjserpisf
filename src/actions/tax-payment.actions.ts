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
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
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
      await checkIdempotency(idempotencyKey, tx, user.id)

      const payment = await tx.taxPayment.create({
        data: {
          slug: await nextSlug("taxPayment", documentNo),
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
