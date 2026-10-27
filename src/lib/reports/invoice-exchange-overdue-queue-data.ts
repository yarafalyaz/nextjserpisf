/**
 * Loader read-only antrean tukar faktur lewat batas
 * (F-2026-10-27-101-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (PUTUSAN LEAD Q-IEX-3): izin
 * `view_invoice_exchanges` ditegakkan di sini; tanpa izin loader
 * menolak sebelum query apa pun. Tanpa key baru tahap 1.
 *
 * Anti-N+1: satu query InvoiceExchange (relasi customer + items +
 * salesInvoice) + satu query returnCredit massal existing
 * (`loadReturnCreditByInvoiceId`, derivation yang sama dengan
 * statement/aging — bukan query agregasi kedua). BUKAN query per baris.
 *
 * Baca-saja mutlak (BR-IEX-06/07): loader hanya findMany; tidak
 * memanggil aksi tulis/jurnal apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildInvoiceExchangeOverdueQueue,
  type InvoiceExchangeOverdueInput,
  type InvoiceExchangeOverdueQueue,
} from "@/lib/reports/invoice-exchange-overdue-queue"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"

export interface InvoiceExchangeOverdueQueueOptions {
  now?: Date
}

export async function getInvoiceExchangeOverdueQueue(
  options: InvoiceExchangeOverdueQueueOptions = {},
): Promise<InvoiceExchangeOverdueQueue> {
  await requirePermission("view_invoice_exchanges")

  const exchanges = await prisma.invoiceExchange.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      date: true,
      receiptNumber: true,
      dueDate: true,
      deletedAt: true,
      customer: { select: { name: true } },
      items: {
        select: {
          amount: true,
          salesInvoice: {
            select: {
              id: true,
              grandTotal: true,
              paidAmount: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const invoiceIds = [
    ...new Set(exchanges.flatMap((e) => e.items.map((i) => i.salesInvoice.id))),
  ]
  const returnCreditByInvoiceId =
    invoiceIds.length > 0 ? await loadReturnCreditByInvoiceId(invoiceIds) : new Map<number, number>()

  const inputs: InvoiceExchangeOverdueInput[] = exchanges.map((e) => ({
    exchangeId: e.id,
    slug: e.slug,
    documentNo: e.documentNo,
    date: e.date,
    customerName: e.customer.name,
    receiptNumber: e.receiptNumber,
    dueDate: e.dueDate,
    deletedAt: e.deletedAt,
    invoices: e.items.map((i) => ({
      salesInvoiceId: i.salesInvoice.id,
      exchangedAmount: i.amount,
      grandTotal: i.salesInvoice.grandTotal,
      paidAmount: i.salesInvoice.paidAmount,
      status: String(i.salesInvoice.status),
      deletedAt: i.salesInvoice.deletedAt,
      returnCredit: returnCreditByInvoiceId.get(i.salesInvoice.id) ?? 0,
    })),
  }))

  return buildInvoiceExchangeOverdueQueue(inputs, options.now ?? new Date())
}
