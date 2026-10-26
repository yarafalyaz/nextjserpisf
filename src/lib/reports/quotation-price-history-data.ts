/**
 * Loader read-only riwayat harga PENAWARAN per pasangan pelanggan×barang
 * (F-2026-10-25-039-S tahap 1, PUTUSAN Lead PR #901 komentar 6399637522).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (Q-QPH-2, pola discount-exposure-data.ts); tanpa key baru.
 * Pelanggan WAJIB dipilih pemanggil; loader ini hanya dipanggil untuk
 * satu pelanggan terpilih (tanpa pilihan = nol keluaran massal di page,
 * BR-QPH-12). Periode divalidasi builder (maks 365 hari, Q-QPH-4).
 *
 * Anti-N+1: satu query massal quotation pelanggan dalam periode dengan
 * seksi + baris berjalan ikut select, satu query nama/sku item massal
 * untuk itemId yang benar-benar muncul, satu query histori
 * `auto_rejected` massal (revisi berjalan saja) untuk ember
 * DITOLAK OTOMATIS. `QuotationHistory.dataSnapshot` TIDAK dibaca
 * (Q-QPH-3: bentuk Json bebas tidak terbukti stabil; tahap 1 baris
 * berjalan saja, BR-QPH-11).
 *
 * Baca-saja mutlak (BR-QPH-09): nol mutasi Quotation/QuotationItem/
 * status; kedaluwarsa diturunkan builder, tidak pernah ditulis.
 * Harga penawaran sensitif komersial: jangan panggil loader ini dari
 * permukaan tanpa gerbang `view_reports` yang sama.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  assertQuotationPriceHistoryPeriod,
  buildQuotationPriceHistory,
  type QuotationPriceEventInput,
  type QuotationPriceHistory,
} from "@/lib/reports/quotation-price-history"

export interface QuotationPriceHistoryQuery {
  customerId: number
  periodeMulai: Date
  periodeSelesai: Date
  /** Default false: DRAFT hanya lewat saringan eksplisit (Q-QPH-4). */
  includeDraft?: boolean
  /** Saringan satu barang; kosong = semua barang pelanggan. */
  itemId?: number | null
}

export async function getQuotationPriceHistory(
  query: QuotationPriceHistoryQuery,
  now: Date = new Date(),
): Promise<QuotationPriceHistory> {
  await requirePermission("view_reports")
  assertQuotationPriceHistoryPeriod(query.periodeMulai, query.periodeSelesai)

  const quotations = await prisma.quotation.findMany({
    where: {
      customerId: query.customerId,
      deletedAt: null,
      date: { gte: query.periodeMulai, lte: query.periodeSelesai },
      ...(query.itemId != null
        ? {
            sections: {
              some: { items: { some: { itemId: query.itemId } } },
            },
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      revisionNumber: true,
      customerId: true,
      date: true,
      validUntil: true,
      status: true,
      customer: { select: { name: true } },
      sections: {
        select: {
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
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ date: "desc" }, { documentNo: "desc" }, { id: "desc" }],
  })

  if (quotations.length === 0) {
    return buildQuotationPriceHistory([], {
      periodeMulai: query.periodeMulai,
      periodeSelesai: query.periodeSelesai,
      now,
      includeDraft: query.includeDraft,
      itemId: query.itemId,
    })
  }

  const itemIds = Array.from(
    new Set(
      quotations.flatMap((quotation) =>
        quotation.sections.flatMap((section) =>
          section.items.map((item) => item.itemId).filter((itemId): itemId is number => itemId != null),
        ),
      ),
    ),
  )
  const quotationIds = quotations.map((quotation) => quotation.id)
  const revisionById = new Map(quotations.map((quotation) => [quotation.id, quotation.revisionNumber]))

  const [items, histories] = await Promise.all([
    itemIds.length > 0
      ? prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, sku: true },
        })
      : Promise.resolve([] as { id: number; name: string; sku: string }[]),
    prisma.quotationHistory.findMany({
      where: { quotationId: { in: quotationIds }, action: "auto_rejected" },
      select: { quotationId: true, revisionNumber: true },
    }),
  ])

  const itemById = new Map(items.map((item) => [item.id, item]))
  // DITOLAK OTOMATIS hanya dari histori revisi BERJALAN (EC-8/BR-QPH-04):
  // penolakan otomatis revisi lama tidak mewarnai revisi terkini.
  const autoRejectedQuotationIds = new Set(
    histories
      .filter((history) => history.revisionNumber === revisionById.get(history.quotationId))
      .map((history) => history.quotationId),
  )

  const inputs: QuotationPriceEventInput[] = quotations.flatMap((quotation) =>
    quotation.sections.flatMap((section) =>
      section.items.map((item) => ({
        quotationId: quotation.id,
        quotationItemId: item.id,
        slug: quotation.slug,
        documentNo: quotation.documentNo,
        revisionNumber: quotation.revisionNumber,
        customerId: quotation.customerId,
        customerName: quotation.customer.name,
        itemId: item.itemId,
        itemName: item.itemId != null ? (itemById.get(item.itemId)?.name ?? null) : null,
        itemSku: item.itemId != null ? (itemById.get(item.itemId)?.sku ?? null) : null,
        description: item.description,
        date: quotation.date,
        validUntil: quotation.validUntil,
        status: quotation.status,
        autoRejected: autoRejectedQuotationIds.has(quotation.id),
        qty: Number(item.qty),
        uom: item.uom,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        total: Number(item.total),
      })),
    ),
  )

  return buildQuotationPriceHistory(inputs, {
    periodeMulai: query.periodeMulai,
    periodeSelesai: query.periodeSelesai,
    now,
    includeDraft: query.includeDraft,
    itemId: query.itemId,
  })
}
