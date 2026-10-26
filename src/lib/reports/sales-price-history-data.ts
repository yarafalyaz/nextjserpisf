/**
 * Loader read-only riwayat harga JUAL aktual per pasangan pelanggan×barang
 * (F-2026-10-25-028-S tahap 1).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (BR-PH-09, pola quotation-price-history-data.ts /
 * discount-exposure-data.ts); tanpa key baru. Tautan detail per kejadian
 * (`tautanDetail` builder) membuka faktur existing yang gerbangnya
 * `view_sales_invoices` (katalog terverifikasi spec §3, Q-PH-2).
 * Pelanggan WAJIB dipilih pemanggil; loader ini hanya dipanggil untuk
 * satu pelanggan terpilih (tanpa pilihan = nol keluaran massal di page,
 * BR-PH-08). Periode divalidasi builder (maks 365 hari).
 *
 * Populasi query persis BR-PH-01: status `RECOGNISED_AR_STATUSES` +
 * `deletedAt: null`; builder menyaring ulang lapis kedua.
 *
 * Anti-N+1: satu query massal faktur pelanggan dalam periode dengan
 * baris ikut select, satu query nama/sku item massal untuk itemId yang
 * benar-benar muncul. Baca-saja mutlak (AC-PH-B5): nol mutasi
 * SalesInvoice/SalesInvoiceItem/harga.
 *
 * Harga jual per pelanggan sensitif komersial: jangan panggil loader ini
 * dari permukaan tanpa gerbang `view_reports` yang sama.
 */

import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  assertSalesPriceHistoryPeriod,
  buildSalesPriceHistory,
  type SalesPriceEventInput,
  type SalesPriceHistory,
} from "@/lib/reports/sales-price-history"

export interface SalesPriceHistoryQuery {
  customerId: number
  periodeMulai: Date
  periodeSelesai: Date
  /** Saringan satu barang; kosong = semua barang pelanggan. */
  itemId?: number | null
}

export async function getSalesPriceHistory(query: SalesPriceHistoryQuery): Promise<SalesPriceHistory> {
  await requirePermission("view_reports")
  assertSalesPriceHistoryPeriod(query.periodeMulai, query.periodeSelesai)

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      customerId: query.customerId,
      status: { in: [...RECOGNISED_AR_STATUSES] },
      deletedAt: null,
      date: { gte: query.periodeMulai, lte: query.periodeSelesai },
      ...(query.itemId != null
        ? {
            items: { some: { itemId: query.itemId } },
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      customerId: true,
      date: true,
      status: true,
      deletedAt: true,
      customer: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemId: true,
          description: true,
          uom: true,
          qty: true,
          unitPrice: true,
          discount: true,
          total: true,
          priceSource: true,
          priceListId: true,
          priceListMinQty: true,
        },
        orderBy: [{ id: "asc" }],
      },
    },
    orderBy: [{ date: "desc" }, { documentNo: "desc" }, { id: "desc" }],
  })

  if (invoices.length === 0) {
    return buildSalesPriceHistory([], {
      periodeMulai: query.periodeMulai,
      periodeSelesai: query.periodeSelesai,
      itemId: query.itemId,
    })
  }

  const itemIds = Array.from(
    new Set(
      invoices.flatMap((invoice) =>
        invoice.items.map((item) => item.itemId).filter((itemId): itemId is number => itemId != null),
      ),
    ),
  )

  const items =
    itemIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, sku: true },
        })
      : []

  const itemById = new Map(items.map((item) => [item.id, item]))

  const inputs: SalesPriceEventInput[] = invoices.flatMap((invoice) =>
    invoice.items.map((item) => ({
      invoiceId: invoice.id,
      invoiceItemId: item.id,
      slug: invoice.slug,
      documentNo: salesInvoiceLabel({ id: invoice.id, documentNo: invoice.documentNo }),
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      itemId: item.itemId,
      // Nama master kini apa adanya (EC-2); harga tetap fakta baris.
      itemName: item.itemId != null ? (itemById.get(item.itemId)?.name ?? null) : null,
      itemSku: item.itemId != null ? (itemById.get(item.itemId)?.sku ?? null) : null,
      description: item.description,
      date: invoice.date,
      status: invoice.status,
      deletedAt: invoice.deletedAt,
      qty: Number(item.qty),
      uom: item.uom,
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      total: Number(item.total),
      priceSource: item.priceSource,
      priceListId: item.priceListId,
      priceListMinQty: item.priceListMinQty != null ? Number(item.priceListMinQty) : null,
    })),
  )

  return buildSalesPriceHistory(inputs, {
    periodeMulai: query.periodeMulai,
    periodeSelesai: query.periodeSelesai,
    itemId: query.itemId,
  })
}
