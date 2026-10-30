/**
 * Loader ekspor XML Coretax faktur keluaran — F-2026-10-23-113-V.
 *
 * Membaca snapshot TaxInvoice terbekukan + baris SalesInvoiceItem tertaut
 * PERSIS tersimpan (nol hitung ulang DPP/PPN, nol baca tarif master
 * berjalan), lalu memanggil builder murni `buildCoretaxOutputXml`.
 * Satu query massal per sumber (hindari N+1).
 *
 * R6IE-07: alamat/email pembeli dan jenis jasa/barang dibaca dari snapshot
 * TaxInvoice/SalesInvoiceItem terbekukan. Tidak ada fallback ke master
 * pelanggan atau item berjalan — snapshot lama yang belum lengkap tetap null
 * lalu ditolak bernama oleh builder.
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
            buyerAddress: true,
            buyerEmail: true,
            salesInvoiceId: true,
            salesInvoice: {
              select: {
                status: true,
                items: {
                  select: {
                    description: true,
                    qty: true,
                    uom: true,
                    unitPrice: true,
                    discount: true,
                    total: true,
                    itemId: true,
                    isService: true,
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

  const replacedIds = [...new Set(invoices.map((i) => i.replacesId).filter((v): v is number => v != null))]
  const replaced =
    replacedIds.length === 0
      ? []
      : await prisma.taxInvoice.findMany({
          where: { id: { in: replacedIds } },
          select: { id: true, taxInvoiceNumber: true },
        })
  const replacedById = new Map(replaced.map((r) => [r.id, r]))

  const snapshots: CoretaxExportInvoiceSnapshot[] = invoices.map((inv) => {
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
      buyerAddress: inv.buyerAddress ?? null,
      buyerEmail: inv.buyerEmail ?? null,
      sourceStatus: inv.salesInvoice ? String(inv.salesInvoice.status) : null,
      lines: (inv.salesInvoice?.items ?? []).map((line) => ({
        description: line.description,
        qty: num(line.qty),
        uom: line.uom,
        unitPrice: num(line.unitPrice),
        discount: num(line.discount),
        total: num(line.total),
        isService: line.isService,
      })),
    }
  })

  // Pertahankan urut ID pilihan pemanggil (deterministik untuk hash batch).
  const order = new Map(ids.map((id, i) => [id, i]))
  snapshots.sort((a, b) => (order.get(a.taxInvoiceId) ?? 0) - (order.get(b.taxInvoiceId) ?? 0))

  return buildCoretaxOutputXml(snapshots, seller)
}
