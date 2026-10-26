/**
 * Loader read-only antrean draf penawaran basi belum terkirim
 * (F-2026-10-26-055-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Izin `view_quotations` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (Q-QD-4: tanpa key baru; pola delivered-unbilled-data.ts); halaman
 * pemanggil menegakkannya juga sebelum loader. Tanpa izin: nol baris bocor
 * (AC-QD-5).
 *
 * Populasi query persis BR-QD-01: Quotation `status: "draft"` +
 * `deletedAt: null`; builder menyaring ulang lapis kedua. Penjual kanonik
 * = `salesEmployeeId` -> Employee (ratifikasi Q-QD-5); `createdBy` TIDAK
 * dibaca sama sekali — null tampil `—`, dilarang fallback. Draf item-0
 * tampil polos: loader tidak menghitung item (Q-QD-6).
 *
 * Anti-N+1: satu query Quotation (+customer) + satu query Employee massal.
 * Baca-saja mutlak: nol mutasi Quotation/status/jurnal (BR-QD-05).
 * GrandTotal verbatim baris tersimpan (Number di tepi; BR-QD-09).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildQuotationDraftQueue,
  type QuotationDraftInput,
  type QuotationDraftQueue,
} from "@/lib/reports/quotation-draft-queue"

export interface QuotationDraftQueueOptions {
  /** Tanggal laporan untuk tahap/umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getQuotationDraftQueue(
  options: QuotationDraftQueueOptions = {},
): Promise<QuotationDraftQueue> {
  await requirePermission("view_quotations")

  const quotations = await prisma.quotation.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      customerId: true,
      salesEmployeeId: true,
      date: true,
      validUntil: true,
      createdAt: true,
      grandTotal: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const sellerIds = Array.from(
    new Set(
      quotations
        .map((q) => q.salesEmployeeId)
        .filter((id): id is number => id != null),
    ),
  )
  const sellers =
    sellerIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : []
  const sellerNameById = new Map(sellers.map((e) => [e.id, e.name]))

  const inputs: QuotationDraftInput[] = quotations.map((q) => ({
    quotationId: q.id,
    slug: q.slug,
    documentNo: q.documentNo,
    status: q.status,
    deletedAt: q.deletedAt,
    customerId: q.customerId,
    customerName: q.customer.name,
    salesEmployeeId: q.salesEmployeeId,
    salesEmployeeName: q.salesEmployeeId
      ? (sellerNameById.get(q.salesEmployeeId) ?? null)
      : null,
    date: q.date,
    validUntil: q.validUntil,
    createdAt: q.createdAt,
    grandTotal: Number(q.grandTotal),
  }))

  return buildQuotationDraftQueue(inputs, options.now ?? new Date())
}
