/**
 * Loader read-only antrean faktur pajak draft mengendap
 * (F-2026-10-27-098-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (PUTUSAN LEAD Q-TIQ-5, BR-TIQ-06): izin
 * `create_tax_invoices` — satu-satunya key resource tax_invoices di
 * katalog — ditegakkan di sini. Tanpa scope baris (domain pajak
 * existing tidak mengenal scope SDM/per-pembuat). Nol key baru.
 *
 * Select eksplisit daftar-putih (BR-TIQ-04): TIDAK PERNAH memuat
 * `xmlPayload`/`xmlHash`/`djpMessage`. Anti-N+1: satu query massal
 * populasi; nama lawan dari snapshot `counterpartyName` tersimpan,
 * bukan query relasi per baris (BR-TIQ-11/12).
 *
 * Baca-saja mutlak (BR-TIQ-10): loader hanya findMany; tidak
 * memanggil aksi terbit/ganti/batal/kredit/ekspor apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildTaxInvoiceDraftQueue,
  type TaxInvoiceDraftInput,
  type TaxInvoiceDraftQueue,
} from "@/lib/reports/tax-invoice-draft-queue"

export interface TaxInvoiceDraftQueueOptions {
  now?: Date
}

export async function getTaxInvoiceDraftQueue(
  options: TaxInvoiceDraftQueueOptions = {},
): Promise<TaxInvoiceDraftQueue> {
  await requirePermission("create_tax_invoices")

  const invoices = await prisma.taxInvoice.findMany({
    where: { djpStatus: "draft" },
    select: {
      id: true,
      slug: true,
      direction: true,
      djpStatus: true,
      transactionCode: true,
      taxInvoiceNumber: true,
      taxInvoiceDate: true,
      taxPeriod: true,
      dpp: true,
      taxRate: true,
      taxAmount: true,
      counterpartyName: true,
      creditStatus: true,
      replacesId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const inputs: TaxInvoiceDraftInput[] = invoices.map((t) => ({
    taxInvoiceId: t.id,
    slug: t.slug,
    direction: t.direction,
    djpStatus: t.djpStatus,
    transactionCode: t.transactionCode,
    taxInvoiceNumber: t.taxInvoiceNumber,
    taxInvoiceDate: t.taxInvoiceDate,
    taxPeriod: t.taxPeriod,
    dpp: t.dpp,
    taxRate: t.taxRate,
    taxAmount: t.taxAmount,
    counterpartyName: t.counterpartyName,
    creditStatus: t.creditStatus,
    replacesId: t.replacesId,
    createdAt: t.createdAt,
  }))

  return buildTaxInvoiceDraftQueue(inputs, options.now ?? new Date())
}
