/**
 * Loader ekspor XML Coretax faktur keluaran — F-2026-10-23-113-V.
 *
 * Membaca snapshot TaxInvoice terbekukan + baris SalesInvoiceItem tertaut
 * PERSIS tersimpan (nol hitung ulang DPP/PPN, nol baca tarif master
 * berjalan), lalu memanggil builder murni `buildCoretaxOutputXml`.
 * Satu query massal per sumber (hindari N+1).
 *
 * SellerIDTKU dibaca dari `SystemSetting.companyNitku` (TASK-020 B5) —
 * kolom sumber khusus NITKU penjual 22 digit, diisi lewat Pengaturan
 * Perusahaan. Kosong/format salah tetap diteruskan apa adanya: builder
 * menolak fail-closed bernama, loader tidak mengarang nilai dari NPWP.
 * Jangan timpa jejak impor (`xmlPayload`/`xmlHash`/`xmlImportedAt` milik
 * impor) — hasil ekspor dikembalikan ke pemanggil, tidak ditulis ke
 * kolom impor.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildCoretaxOutputXml,
  type CoretaxExportInvoiceSnapshot,
  type CoretaxExportResult,
  type CoretaxExportSellerSnapshot,
} from "@/lib/tax/coretax-xml-export"

export type { CoretaxExportResult, CoretaxExportRejection } from "@/lib/tax/coretax-xml-export"

function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "number") return v
  if (typeof v === "object" && "toNumber" in (v as Record<string, unknown>)) {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(String(v))
}

/**
 * Muat snapshot + bangun XML untuk daftar ID TaxInvoice terpilih.
 * ID tak ditemukan tidak melahirkan faktur karangan — diabaikan dari
 * batch (pemanggil membandingkan exportedIds/rejections terhadap input).
 */
export async function loadCoretaxOutputExport(taxInvoiceIds: number[]): Promise<CoretaxExportResult> {
  const ids = [...new Set(taxInvoiceIds)]
  const [settings, invoices] = await Promise.all([
    prisma.systemSetting.findFirst({
      select: { companyTaxId: true, companyNitku: true },
    }),
    ids.length === 0
      ? Promise.resolve([])
      : prisma.taxInvoice.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            direction: true,
            transactionCode: true,
            taxInvoiceNumber: true,
            taxInvoiceDate: true,
            dpp: true,
            taxRate: true,
            taxAmount: true,
            djpStatus: true,
            replacesId: true,
            counterpartyTaxId: true,
            counterpartyName: true,
            counterpartyNitku: true,
            salesInvoiceId: true,
            salesInvoice: {
              select: {
                status: true,
                customerId: true,
                items: {
                  select: {
                    description: true,
                    qty: true,
                    uom: true,
                    unitPrice: true,
                    discount: true,
                    total: true,
                    itemId: true,
                  },
                },
              },
            },
          },
        }),
  ])

  const seller: CoretaxExportSellerSnapshot = {
    tin: settings?.companyTaxId ?? null,
    // NITKU penjual dari pengaturan perusahaan; kosong → tolak bernama di builder.
    sellerIdtku: settings?.companyNitku ?? null,
  }

  const customerIds = [
    ...new Set(invoices.map((i) => i.salesInvoice?.customerId).filter((v): v is number => v != null)),
  ]
  const itemIds = [
    ...new Set(
      invoices.flatMap((i) => (i.salesInvoice?.items ?? []).map((l) => l.itemId)).filter((v): v is number => v != null),
    ),
  ]
  const replacedIds = [...new Set(invoices.map((i) => i.replacesId).filter((v): v is number => v != null))]

  const [customers, items, replaced] = await Promise.all([
    customerIds.length === 0
      ? Promise.resolve([])
      : prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, address: true, email: true },
        }),
    itemIds.length === 0
      ? Promise.resolve([])
      : prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, unitOfMeasure: true, isService: true },
        }),
    replacedIds.length === 0
      ? Promise.resolve([])
      : prisma.taxInvoice.findMany({
          where: { id: { in: replacedIds } },
          select: { id: true, taxInvoiceNumber: true },
        }),
  ])
  const customerById = new Map(customers.map((c) => [c.id, c]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const replacedById = new Map(replaced.map((r) => [r.id, r]))

  const snapshots: CoretaxExportInvoiceSnapshot[] = invoices.map((inv) => {
    const customer = inv.salesInvoice ? customerById.get(inv.salesInvoice.customerId) : undefined
    return {
      taxInvoiceId: inv.id,
      direction: inv.direction,
      transactionCode: inv.transactionCode,
      taxInvoiceNumber: inv.taxInvoiceNumber,
      taxInvoiceDate: inv.taxInvoiceDate,
      dpp: num(inv.dpp),
      taxRate: num(inv.taxRate),
      taxAmount: num(inv.taxAmount),
      djpStatus: inv.djpStatus,
      replacesId: inv.replacesId,
      replacedTaxInvoiceNumber: inv.replacesId != null ? (replacedById.get(inv.replacesId)?.taxInvoiceNumber ?? null) : null,
      counterpartyTaxId: inv.counterpartyTaxId,
      counterpartyName: inv.counterpartyName,
      counterpartyNitku: inv.counterpartyNitku,
      buyerAddress: customer?.address ?? null,
      buyerEmail: customer?.email ?? null,
      sourceStatus: inv.salesInvoice ? String(inv.salesInvoice.status) : null,
      lines: (inv.salesInvoice?.items ?? []).map((line) => {
        const item = line.itemId != null ? itemById.get(line.itemId) : undefined
        return {
          description: line.description ?? item?.name ?? null,
          qty: num(line.qty),
          uom: line.uom ?? item?.unitOfMeasure ?? null,
          unitPrice: num(line.unitPrice),
          discount: num(line.discount),
          total: num(line.total),
          isService: item?.isService ?? false,
        }
      }),
    }
  })

  // Pertahankan urut ID pilihan pemanggil (deterministik untuk hash batch).
  const order = new Map(ids.map((id, i) => [id, i]))
  snapshots.sort((a, b) => (order.get(a.taxInvoiceId) ?? 0) - (order.get(b.taxInvoiceId) ?? 0))

  return buildCoretaxOutputXml(snapshots, seller)
}
