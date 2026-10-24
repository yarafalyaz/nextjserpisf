"use server"

/**
 * Aksi dokumen denda piutang (F-2026-10-22-093-V, vonis BOT 4 PR #563).
 *
 * - Syarat denda: master bertanggal efektif per pelanggan (P2a) — nilai
 *   tarif keputusan komersial pemilik proses, BUKAN hardcode di sini.
 * - Terbit: eksplisit per faktur (P2c), dokumen TERPISAH, snapshot tarif
 *   dibekukan, jurnal akrual via hook, idempoten via
 *   FinancialIdempotencyKey (E93-5). Akun pendapatan denda kosong =
 *   fail-closed (E93-2). Faktur asal TIDAK PERNAH diubah (E93-4).
 * - Bayar: alokasi ke dokumen denda saja (E93-7).
 * - Waiver/koreksi: reversal dokumen (P6/E93-6). TIDAK ada aksi edit
 *   nominal — updateSalesLateFeeAmount sengaja menolak selalu.
 * - PPN tidak dipungut, tanpa faktur pajak (P4). PPh 23 atas denda:
 *   BUTUH-VONIS-AKUNTAN (P5) — tidak dibangun di sini.
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import {
  bindIdempotencyKey,
  claimIdempotencyKey,
  payloadFingerprint,
} from "@/lib/services/financial-idempotency.service"
import { computeLateFeeAmount } from "@/lib/reports/late-fee"
import { lateFeeStatusAfterPayment } from "@/lib/reports/late-fee"
import {
  onSalesLateFeePaymentCreated,
  onSalesLateFeePosted,
  reverseSalesLateFeeJournalTx,
} from "@/lib/hooks/sales-late-fee.hook"

const REVALIDATE = "/penjualan/antrean-penagihan"

export interface LateFeeActionResult {
  success: boolean
  error?: string
  id?: number
  documentNo?: string
}

function parseId(raw: unknown): number | null {
  const str = String(raw ?? "")
  if (!/^[0-9]+$/.test(str)) return null
  const value = Number(str)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseDate(raw: unknown): Date | null {
  const str = String(raw ?? "").trim()
  if (!str) return null
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseMoney(raw: unknown): number | null {
  const str = String(raw ?? "").trim()
  if (str === "") return null
  const value = Number(str)
  return Number.isFinite(value) ? value : null
}

/** Buat syarat denda kontraktual bertanggal efektif untuk pelanggan. */
export async function createCustomerLateFeeTerm(
  formData: FormData,
): Promise<LateFeeActionResult> {
  try {
    const user = await requirePermission("create_sales_late_fees")
    const customerId = parseId(formData.get("customerId"))
    if (customerId == null) return { success: false, error: "Pelanggan tidak valid." }

    const rate = parseMoney(formData.get("ratePercentPerDay"))
    const flat = parseMoney(formData.get("flatAmountPerDay"))
    const cap = parseMoney(formData.get("capAmount"))
    const effectiveFrom = parseDate(formData.get("effectiveFrom"))
    const effectiveTo = parseDate(formData.get("effectiveTo"))

    if ((rate == null) === (flat == null)) {
      return {
        success: false,
        error: "Syarat denda wajib tepat satu basis tarif: persen per hari atau nominal per hari.",
      }
    }
    if (rate != null && rate <= 0) return { success: false, error: "Tarif persen per hari harus lebih dari nol." }
    if (flat != null && flat <= 0) return { success: false, error: "Tarif nominal per hari harus lebih dari nol." }
    if (cap != null && cap <= 0) return { success: false, error: "Plafon denda harus lebih dari nol." }
    if (!effectiveFrom) return { success: false, error: "Tanggal efektif dari wajib diisi." }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return { success: false, error: "Tanggal efektif sampai tidak boleh sebelum tanggal efektif dari." }
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!customer) return { success: false, error: "Pelanggan tidak ditemukan." }

    const created = await prisma.customerLateFeeTerm.create({
      data: {
        customerId,
        ratePercentPerDay: rate,
        flatAmountPerDay: flat,
        capAmount: cap,
        effectiveFrom,
        effectiveTo,
        notes: formData.get("notes") ? String(formData.get("notes")) : null,
        createdBy: Number(user.id),
      },
      select: { id: true },
    })
    await logActivity(
      "customer_late_fee_term_created",
      "CustomerLateFeeTerm",
      created.id,
      `Syarat denda pelanggan ${customer.name} efektif ${effectiveFrom.toISOString().slice(0, 10)}`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createCustomerLateFeeTerm failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan syarat denda.") }
  }
}

/** Terbitkan dokumen denda untuk satu faktur (eksplisit per faktur, P2c). */
export async function issueSalesLateFee(formData: FormData): Promise<LateFeeActionResult> {
  try {
    const user = await requirePermission("create_sales_late_fees")
    const salesInvoiceId = parseId(formData.get("salesInvoiceId"))
    const termId = parseId(formData.get("termId"))
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim()
    const date = parseDate(formData.get("date")) ?? new Date()
    if (salesInvoiceId == null) return { success: false, error: "Faktur tidak valid." }
    if (termId == null) return { success: false, error: "Syarat denda tidak valid." }
    if (!idempotencyKey) return { success: false, error: "Idempotency key wajib diisi." }

    const result = await prisma.$transaction(async (tx) => {
      const fingerprint = payloadFingerprint({
        salesInvoiceId,
        termId,
        date: date.toISOString().slice(0, 10),
      })
      const claim = await claimIdempotencyKey(
        tx as never,
        "sales_late_fee_issue",
        idempotencyKey,
        Number(user.id),
        fingerprint,
      )
      if (claim.replayed) {
        const prev = await tx.salesLateFee.findUnique({
          where: { id: claim.resultRefId ?? 0 },
          select: { id: true, documentNo: true },
        })
        return { id: prev?.id ?? 0, documentNo: prev?.documentNo, replayed: true as const }
      }

      const invoice = await tx.salesInvoice.findFirst({
        where: { id: salesInvoiceId, deletedAt: null },
        select: {
          id: true,
          documentNo: true,
          customerId: true,
          status: true,
          grandTotal: true,
          paidAmount: true,
          dueDate: true,
          invoiceExchangeItems: {
            where: { exchange: { deletedAt: null } },
            orderBy: { id: "desc" },
            take: 1,
            select: { exchange: { select: { dueDate: true } } },
          },
        },
      })
      if (!invoice) throw new Error("Faktur tidak ditemukan.")
      // BR-COL-03: due acuan = exchange.dueDate bila ada else faktur.dueDate.
      const dueReferenceDate =
        invoice.invoiceExchangeItems[0]?.exchange.dueDate ?? invoice.dueDate

      const term = await tx.customerLateFeeTerm.findFirst({
        where: { id: termId, customerId: invoice.customerId },
        select: {
          id: true,
          ratePercentPerDay: true,
          flatAmountPerDay: true,
          capAmount: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      })
      if (!term) throw new Error("Syarat denda tidak ditemukan untuk pelanggan faktur ini.")

      // Snapshot byte-sama faktur asal (E93-4): nilai dibaca SEBELUM tulis
      // dan tidak pernah ditulis balik oleh alur ini.
      const computed = computeLateFeeAmount({
        invoice: {
          status: invoice.status,
          grandTotal: Number(invoice.grandTotal),
          paidAmount: Number(invoice.paidAmount),
          dueReferenceDate,
        },
        term: {
          id: term.id,
          ratePercentPerDay: term.ratePercentPerDay == null ? null : Number(term.ratePercentPerDay),
          flatAmountPerDay: term.flatAmountPerDay == null ? null : Number(term.flatAmountPerDay),
          capAmount: term.capAmount == null ? null : Number(term.capAmount),
          effectiveFrom: term.effectiveFrom,
          effectiveTo: term.effectiveTo,
        },
        asOf: date,
      })

      const documentNo = await generateDocumentNumber("LF")
      const created = await tx.salesLateFee.create({
        data: {
          documentNo,
          salesInvoiceId: invoice.id,
          customerId: invoice.customerId,
          termId: computed.termId,
          date,
          dueReferenceDate: computed.dueReferenceDate,
          overdueDays: computed.overdueDays,
          basisAmount: computed.basisAmount,
          ratePercentPerDay: computed.ratePercentPerDay,
          flatAmountPerDay: computed.flatAmountPerDay,
          capAmount: computed.capAmount,
          amount: computed.amount,
          status: "posted",
          idempotencyKey,
          notes: formData.get("notes") ? String(formData.get("notes")) : null,
          createdBy: Number(user.id),
        },
        select: { id: true, documentNo: true },
      })

      // Jurnal akrual dalam tx yang sama: gagal akun = nol tulis (E93-2).
      await onSalesLateFeePosted(created.id, Number(user.id), tx as never)
      await bindIdempotencyKey(tx as never, idempotencyKey, "SalesLateFee", created.id)
      return { id: created.id, documentNo: created.documentNo, replayed: false as const }
    })

    await logActivity(
      "sales_late_fee_issued",
      "SalesLateFee",
      result.id,
      result.replayed
        ? `Terbit denda ${result.documentNo ?? ""} (replay idempoten)`
        : `Dokumen denda ${result.documentNo ?? ""} diterbitkan`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: result.id, documentNo: result.documentNo ?? undefined }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("issueSalesLateFee failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menerbitkan dokumen denda.") }
  }
}

/** Edit nominal dokumen denda: SELALU ditolak (E93-6). Koreksi = reversal. */
export async function updateSalesLateFeeAmount(
  _formData: FormData,
): Promise<LateFeeActionResult> {
  await requirePermission("create_sales_late_fees")
  return {
    success: false,
    error:
      "Nominal dokumen denda yang sudah diterbitkan tidak bisa diubah. Koreksi hanya lewat pembalikan (reversal) dokumen denda.",
  }
}

/** Catat pembayaran dokumen denda — saldo denda saja, bukan faktur asal. */
export async function paySalesLateFee(formData: FormData): Promise<LateFeeActionResult> {
  try {
    const user = await requirePermission("create_sales_late_fees")
    const salesLateFeeId = parseId(formData.get("salesLateFeeId"))
    const amount = parseMoney(formData.get("amount"))
    const paymentDate = parseDate(formData.get("paymentDate")) ?? new Date()
    const paymentMethod = String(formData.get("paymentMethod") ?? "").trim()
    const accountId = parseId(formData.get("accountId"))
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim()
    if (salesLateFeeId == null) return { success: false, error: "Dokumen denda tidak valid." }
    if (amount == null || amount <= 0) return { success: false, error: "Nominal pembayaran harus lebih dari nol." }
    if (!paymentMethod) return { success: false, error: "Metode pembayaran wajib diisi." }
    if (!idempotencyKey) return { success: false, error: "Idempotency key wajib diisi." }

    const result = await prisma.$transaction(async (tx) => {
      const fingerprint = payloadFingerprint({ salesLateFeeId, amount })
      const claim = await claimIdempotencyKey(
        tx as never,
        "sales_late_fee_pay",
        idempotencyKey,
        Number(user.id),
        fingerprint,
      )
      if (claim.replayed) return { id: claim.resultRefId ?? 0 }

      const doc = await tx.salesLateFee.findFirst({
        where: { id: salesLateFeeId, deletedAt: null },
        select: { id: true, documentNo: true, amount: true, paidAmount: true, status: true },
      })
      if (!doc) throw new Error("Dokumen denda tidak ditemukan.")
      if (doc.status === "reversed" || doc.status === "paid") {
        throw new Error("Dokumen denda ini tidak bisa menerima pembayaran (sudah lunas/dibalik).")
      }
      const newPaid = Number(doc.paidAmount) + amount
      if (newPaid > Number(doc.amount) + 0.005) {
        throw new Error("Pembayaran melebihi sisa saldo dokumen denda.")
      }

      const documentNo = await generateDocumentNumber("PAY")
      const payment = await tx.salesLateFeePayment.create({
        data: {
          documentNo: `LF-${documentNo}`,
          salesLateFeeId: doc.id,
          amount,
          paymentDate,
          paymentMethod,
          accountId,
          referenceNo: formData.get("referenceNo") ? String(formData.get("referenceNo")) : null,
          notes: formData.get("notes") ? String(formData.get("notes")) : null,
          createdBy: Number(user.id),
        },
        select: { id: true },
      })
      await onSalesLateFeePaymentCreated(payment.id, Number(user.id), tx as never)
      await tx.salesLateFee.update({
        where: { id: doc.id },
        data: {
          paidAmount: newPaid,
          status: lateFeeStatusAfterPayment(Number(doc.amount), newPaid),
        },
      })
      await bindIdempotencyKey(tx as never, idempotencyKey, "SalesLateFeePayment", payment.id)
      return { id: payment.id }
    })

    await logActivity(
      "sales_late_fee_paid",
      "SalesLateFeePayment",
      result.id,
      "Pembayaran dokumen denda dicatat",
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: result.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("paySalesLateFee failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal mencatat pembayaran denda.") }
  }
}

/** Waiver/koreksi: reversal dokumen denda + jurnal reversal (P6). */
export async function reverseSalesLateFee(formData: FormData): Promise<LateFeeActionResult> {
  try {
    const user = await requirePermission("delete_sales_late_fees")
    const salesLateFeeId = parseId(formData.get("salesLateFeeId"))
    const reason = String(formData.get("reason") ?? "").trim()
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim()
    const date = parseDate(formData.get("date")) ?? new Date()
    if (salesLateFeeId == null) return { success: false, error: "Dokumen denda tidak valid." }
    if (!reason) return { success: false, error: "Alasan pembalikan wajib diisi." }
    if (!idempotencyKey) return { success: false, error: "Idempotency key wajib diisi." }

    const result = await prisma.$transaction(async (tx) => {
      const fingerprint = payloadFingerprint({ salesLateFeeId, reason })
      const claim = await claimIdempotencyKey(
        tx as never,
        "sales_late_fee_reverse",
        idempotencyKey,
        Number(user.id),
        fingerprint,
      )
      if (claim.replayed) {
        const prev = await tx.salesLateFee.findUnique({
          where: { id: claim.resultRefId ?? 0 },
          select: { id: true, documentNo: true },
        })
        return { id: prev?.id ?? 0, documentNo: prev?.documentNo }
      }

      const doc = await tx.salesLateFee.findFirst({
        where: { id: salesLateFeeId, deletedAt: null },
        include: { reversedBy: { select: { id: true } } },
      })
      if (!doc) throw new Error("Dokumen denda tidak ditemukan.")
      if (doc.status === "reversed" || doc.reversedBy) {
        throw new Error("Dokumen denda ini sudah dibalik.")
      }
      if (doc.reversesId != null) {
        throw new Error("Dokumen reversal tidak bisa dibalik lagi.")
      }

      await reverseSalesLateFeeJournalTx(tx as never, doc.id, reason, Number(user.id))

      const documentNo = await generateDocumentNumber("LF")
      const reversal = await tx.salesLateFee.create({
        data: {
          documentNo,
          salesInvoiceId: doc.salesInvoiceId,
          customerId: doc.customerId,
          termId: doc.termId,
          date,
          dueReferenceDate: doc.dueReferenceDate,
          overdueDays: doc.overdueDays,
          basisAmount: doc.basisAmount,
          ratePercentPerDay: doc.ratePercentPerDay,
          flatAmountPerDay: doc.flatAmountPerDay,
          capAmount: doc.capAmount,
          amount: doc.amount,
          paidAmount: 0,
          status: "reversed",
          idempotencyKey,
          reversesId: doc.id,
          notes: `Pembalikan: ${reason}`,
          createdBy: Number(user.id),
        },
        select: { id: true, documentNo: true },
      })
      await tx.salesLateFee.update({
        where: { id: doc.id },
        data: { status: "reversed" },
      })
      await bindIdempotencyKey(tx as never, idempotencyKey, "SalesLateFee", reversal.id)
      return { id: reversal.id, documentNo: reversal.documentNo }
    })

    await logActivity(
      "sales_late_fee_reversed",
      "SalesLateFee",
      result.id,
      `Dokumen denda dibalik: ${reason}`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: result.id, documentNo: result.documentNo ?? undefined }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("reverseSalesLateFee failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal membalik dokumen denda.") }
  }
}
