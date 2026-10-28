"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug } from "@/lib/utils/slug-db"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { invoiceExchangeSchema } from "@/lib/validations/sales.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { isSettled } from "@/lib/finance/settlement-status"

const REVALIDATE = "/penjualan/tukar-faktur"

/** Faktur yang boleh diserahkan: sudah diposting (bukan draft). Kelunasan
 * diputuskan dari ANGKA lewat predikat kanonis FIN-BR-006
 * `isSettled(grandTotal, paidAmount)` (ambang Rp1),
 * bukan status saja — halaman tambah memakai tolok ukur yang sama. */
const EXCHANGEABLE_STATUSES = ["posted", "partial"] as const

export interface InvoiceExchangeActionResult {
  success: boolean
  error?: string
  id?: number
}

function parseId(raw: FormDataEntryValue | string | null): number | null {
  const str = String(raw ?? "")
  // ID desimal murni saja — pola repo (/^[0-9]+$/ di route workflow/print/
  // attachments/notifications). Number() mentah menerima "0x10"->16,
  // "1e3"->1000, "0b101"->5, " 5"->5: ID tak terduga lolos ke query.
  if (!/^[0-9]+$/.test(str)) return null
  const value = Number(str)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * Mencatat penyerahan faktur (tukar faktur) untuk satu pelanggan.
 *
 * **Tanpa jurnal** — piutang sudah tercatat oleh fakturnya. Yang dijaga di sini:
 * satu faktur tidak boleh diserahkan dua kali (ditolak bila sudah ada di dokumen
 * tukar faktur lain), dan hanya faktur milik pelanggan itu yang diterima.
 */
export async function createInvoiceExchange(formData: FormData): Promise<InvoiceExchangeActionResult> {
  try {
    const user = await requirePermission("create_invoice_exchanges")

    const parsed = parseFormData(invoiceExchangeSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const date = wibDateToUtcMidnight(v.date)
    const dueDate = v.dueDate ? wibDateToUtcMidnight(v.dueDate) : null
    const customerId = v.customerId
    const receiptNumber = v.receiptNumber?.trim() || null
    const notes = v.notes?.trim() || null

    const invoiceIds = [...new Set(formData.getAll("invoiceIds").map((value) => parseId(value)).filter((id): id is number => id !== null))]
    if (invoiceIds.length === 0) {
      return { success: false, error: "Pilih minimal satu faktur yang diserahkan." }
    }

    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true, name: true } })
    if (!customer) return { success: false, error: "Pelanggan tidak ditemukan." }

    await assertPeriodOpen(date)
    if (dueDate) await assertPeriodOpen(dueDate)

    const invoices = await prisma.salesInvoice.findMany({
      where: { id: { in: invoiceIds }, deletedAt: null },
      select: { id: true, documentNo: true, customerId: true, grandTotal: true, paidAmount: true, status: true },
    })

    if (invoices.length !== invoiceIds.length) {
      return { success: false, error: "Ada faktur yang tidak ditemukan." }
    }

    const wrongCustomer = invoices.filter((invoice) => invoice.customerId !== customerId)
    if (wrongCustomer.length > 0) {
      return {
        success: false,
        error: `Faktur berikut bukan milik pelanggan ini: ${wrongCustomer.map((invoice) => invoice.documentNo).join(", ")}.`,
      }
    }

    const settled = invoices.filter(
      (invoice) => invoice.status === "paid" || isSettled(invoice.grandTotal, invoice.paidAmount),
    )
    if (settled.length > 0) {
      return {
        success: false,
        error: `Faktur berikut sudah lunas sehingga tidak perlu diserahkan: ${settled.map((invoice) => invoice.documentNo).join(", ")}.`,
      }
    }

    const notExchangeable = invoices.filter((invoice) => !(EXCHANGEABLE_STATUSES as readonly string[]).includes(invoice.status))
    if (notExchangeable.length > 0) {
      return {
        success: false,
        error: `Faktur berikut belum diposting sehingga belum bisa diserahkan: ${notExchangeable.map((invoice) => invoice.documentNo).join(", ")}.`,
      }
    }

    const alreadyExchanged = await prisma.invoiceExchangeItem.findMany({
      where: { salesInvoiceId: { in: invoiceIds }, exchange: { deletedAt: null } },
      select: { salesInvoiceId: true },
    })
    if (alreadyExchanged.length > 0) {
      const ids = new Set(alreadyExchanged.map((item) => item.salesInvoiceId))
      const numbers = invoices.filter((invoice) => ids.has(invoice.id)).map((invoice) => invoice.documentNo)
      return { success: false, error: `Faktur berikut sudah pernah diserahkan: ${numbers.join(", ")}.` }
    }

    const documentNo = await generateDocumentNumber("TKF", "simple")

    const created = await prisma.$transaction(async (tx) => {
      // Kunci baris faktur lalu putuskan ulang di dalam tx: cek di luar tx
      // tidak menahan dua submit bersamaan (atau pembayaran bersamaan) —
      // keduanya lolos, faktur yang sama tercatat diserahkan dua kali dan
      // laporan tukar faktur menghitung nilainya ganda. Tidak ada unique
      // constraint di (salesInvoiceId), jadi lock inilah penjaganya.
      const sortedIds = [...invoiceIds].sort((a, b) => a - b)
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id IN (${Prisma.join(sortedIds)}) ORDER BY id FOR UPDATE`

      const lockedInvoices = await tx.salesInvoice.findMany({
        where: { id: { in: invoiceIds }, deletedAt: null },
        select: { id: true, documentNo: true, customerId: true, grandTotal: true, paidAmount: true, status: true },
      })
      if (lockedInvoices.length !== invoiceIds.length) {
        throw new Error("Ada faktur yang tidak ditemukan.")
      }
      const wrongLocked = lockedInvoices.filter((invoice) => invoice.customerId !== customerId)
      if (wrongLocked.length > 0) {
        throw new Error(`Faktur berikut bukan milik pelanggan ini: ${wrongLocked.map((invoice) => invoice.documentNo).join(", ")}.`)
      }
      const settledLocked = lockedInvoices.filter(
        (invoice) => invoice.status === "paid" || isSettled(invoice.grandTotal, invoice.paidAmount),
      )
      if (settledLocked.length > 0) {
        throw new Error(`Faktur berikut sudah lunas sehingga tidak perlu diserahkan: ${settledLocked.map((invoice) => invoice.documentNo).join(", ")}.`)
      }
      const notExchangeableLocked = lockedInvoices.filter((invoice) => !(EXCHANGEABLE_STATUSES as readonly string[]).includes(invoice.status))
      if (notExchangeableLocked.length > 0) {
        throw new Error(`Faktur berikut belum diposting sehingga belum bisa diserahkan: ${notExchangeableLocked.map((invoice) => invoice.documentNo).join(", ")}.`)
      }
      const alreadyLocked = await tx.invoiceExchangeItem.findMany({
        where: { salesInvoiceId: { in: invoiceIds }, exchange: { deletedAt: null } },
        select: { salesInvoiceId: true },
      })
      if (alreadyLocked.length > 0) {
        const ids = new Set(alreadyLocked.map((item) => item.salesInvoiceId))
        const numbers = lockedInvoices.filter((invoice) => ids.has(invoice.id)).map((invoice) => invoice.documentNo)
        throw new Error(`Faktur berikut sudah pernah diserahkan: ${numbers.join(", ")}.`)
      }

      const exchange = await tx.invoiceExchange.create({
        data: {
          slug: await nextSlug("invoiceExchange", documentNo),
          documentNo,
          date,
          customerId,
          receiptNumber,
          dueDate,
          notes,
          createdBy: Number(user.id),
        },
      })

      await tx.invoiceExchangeItem.createMany({
        data: lockedInvoices.map((invoice) => ({
          exchangeId: exchange.id,
          salesInvoiceId: invoice.id,
          amount: new Prisma.Decimal(Number(invoice.grandTotal).toFixed(2)),
        })),
      })

      return exchange
    })

    await logActivity(
      "create",
      "InvoiceExchange",
      created.id,
      `Tukar faktur ${documentNo} — ${invoices.length} faktur (${customer.name})`,
    )
    revalidatePath(REVALIDATE)

    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createInvoiceExchange failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan tukar faktur.") }
  }
}

/**
 * Menghapus dokumen tukar faktur (soft delete). Tidak ada jurnal yang perlu
 * dibalik, jadi faktur-fakturnya otomatis bisa diserahkan lagi.
 */
export async function deleteInvoiceExchange(id: number): Promise<InvoiceExchangeActionResult> {
  try {
    await requirePermission("delete_invoice_exchanges")

    const exchange = await prisma.invoiceExchange.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, date: true },
    })
    if (!exchange) return { success: false, error: "Tukar faktur tidak ditemukan." }

    await assertPeriodOpen(exchange.date)

    await prisma.invoiceExchange.update({ where: { id }, data: { deletedAt: new Date() } })
    await logActivity("delete", "InvoiceExchange", id, `Menghapus tukar faktur ${exchange.documentNo}`)
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteInvoiceExchange failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus tukar faktur.") }
  }
}
