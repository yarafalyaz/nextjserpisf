/**
 * Loader read-only antrean penagihan piutang (F-2026-10-22-089-S).
 *
 * Izin §4/Q-COL-1: `view_reports` DAN `view_sales_invoices` — keduanya
 * ditegakkan di loader ini (server, fail-closed) sebelum query apa pun.
 * Query massal tanpa N+1: faktur posted/partial belum terhapus, item
 * tukar faktur aktif (exchange deletedAt null), tindak lanjut penagihan
 * tidak terhapus. Tahap/umur/urutan di builder murni
 * `collection-queue.ts`. Baca-saja: tanpa jurnal, tanpa tulis
 * (BR-COL-07). Kontak pelanggan hanya ikut karena izin antrean di atas
 * (Q-COL-4); ekspor tanpa kolom kontak adalah urusan permukaan ekspor.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildCollectionQueue,
  type CollectionQueue,
} from "@/lib/reports/collection-queue"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"

export async function getCollectionQueue(
  options: { now?: Date } = {},
): Promise<CollectionQueue> {
  await requirePermission("view_reports")
  await requirePermission("view_sales_invoices")

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ["posted", "partial"] },
    },
    select: {
      id: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      date: true,
      dueDate: true,
      grandTotal: true,
      paidAmount: true,
      customerId: true,
      customer: {
        select: { name: true, phone: true, contactPerson: true },
      },
    },
    orderBy: [{ id: "asc" }],
  })

  const invoiceIds = invoices.map((invoice) => invoice.id)

  const [exchangeItems, followUps, lateFees] = await Promise.all([
    invoiceIds.length === 0
      ? Promise.resolve([])
      : prisma.invoiceExchangeItem.findMany({
          where: { salesInvoiceId: { in: invoiceIds } },
          select: {
            salesInvoiceId: true,
            exchange: {
              select: {
                id: true,
                documentNo: true,
                date: true,
                dueDate: true,
                deletedAt: true,
              },
            },
          },
        }),
    invoiceIds.length === 0
      ? Promise.resolve([])
      : prisma.invoiceCollectionFollowUp.findMany({
          where: { salesInvoiceId: { in: invoiceIds }, deletedAt: null },
          select: {
            salesInvoiceId: true,
            followedUpAt: true,
            outcome: true,
            promisedDate: true,
            deletedAt: true,
          },
          orderBy: [{ followedUpAt: "asc" }, { id: "asc" }],
        }),
    // Indikator denda terutang F-093-V: hanya dokumen denda yang SUDAH
    // terbit (posted/partial) — loader tidak menghitung denda baru.
    invoiceIds.length === 0
      ? Promise.resolve([])
      : prisma.salesLateFee.findMany({
          where: {
            salesInvoiceId: { in: invoiceIds },
            deletedAt: null,
            status: { in: ["posted", "partial"] },
          },
          select: {
            salesInvoiceId: true,
            amount: true,
            paidAmount: true,
            status: true,
            reversesId: true,
          },
        }),
  ])

  // F-104-V: sisa antrean kurangi returnCredit POSTED per faktur.
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoiceIds)

  return buildCollectionQueue(
    invoices.map((invoice) => ({
      invoiceId: invoice.id,
      documentNo: salesInvoiceLabel(invoice),
      status: invoice.status,
      deletedAt: invoice.deletedAt,
      date: invoice.date,
      dueDate: invoice.dueDate,
      grandTotal: Number(invoice.grandTotal),
      paidAmount: Number(invoice.paidAmount),
      returnCredit: returnCreditByInvoiceId.get(invoice.id) ?? 0,
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      customerPhone: invoice.customer.phone ?? null,
      contactPerson: invoice.customer.contactPerson ?? null,
    })),
    exchangeItems.map((item) => ({
      salesInvoiceId: item.salesInvoiceId,
      exchangeId: item.exchange.id,
      exchangeDocumentNo: item.exchange.documentNo,
      exchangeDate: item.exchange.date,
      dueDate: item.exchange.dueDate,
      exchangeDeletedAt: item.exchange.deletedAt,
    })),
    followUps.map((followUp) => ({
      salesInvoiceId: followUp.salesInvoiceId,
      followedUpAt: followUp.followedUpAt,
      outcome: followUp.outcome,
      promisedDate: followUp.promisedDate,
      deletedAt: followUp.deletedAt,
    })),
    { now: options.now },
    lateFees.map((fee) => ({
      salesInvoiceId: fee.salesInvoiceId,
      amount: Number(fee.amount),
      paidAmount: Number(fee.paidAmount),
      status: fee.status,
      reversesId: fee.reversesId,
    })),
  )
}
