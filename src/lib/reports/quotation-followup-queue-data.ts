/**
 * Loader read-only antrean penawaran terkirim belum dijawab
 * (F-2026-10-22-091-S tahap 1, NOL migrasi).
 *
 * Satu query massal penawaran `sent` belum terhapus + satu query massal
 * nama penjual dari `createdBy` (schema Quotation tidak punya kolom
 * salesEmployeeId — penjual tercatat tidak ada = null jujur, AC-QF-11);
 * tanpa N+1. Izin `view_quotations` ditegakkan page pemanggil
 * (requirePermission) sebelum loader ini dipanggil — pola
 * whatsapp-trail-data.ts. Kontak pelanggan ikut hasil HANYA lewat
 * loader ini (antrean berizin); ekspor tahap 1 tanpa phone (Q-QF-4).
 * Hanya baca: nol mutasi status/validUntil/dokumen/jurnal (BR-QF-05).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildQuotationFollowUpQueue,
  type QuotationFollowUpRow,
} from "@/lib/reports/quotation-followup-queue"

export async function getQuotationFollowUpQueue(
  now: Date = new Date(),
): Promise<QuotationFollowUpRow[]> {
  const quotations = await prisma.quotation.findMany({
    where: { status: "sent", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      customerId: true,
      createdBy: true,
      date: true,
      validUntil: true,
      grandTotal: true,
      customer: { select: { name: true, phone: true, contactPerson: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  const sellerIds = Array.from(
    new Set(quotations.map((q) => q.createdBy).filter((id) => id != null)),
  )
  const sellers =
    sellerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : []
  const sellerNameById = new Map(sellers.map((u) => [u.id, u.name]))

  return buildQuotationFollowUpQueue(
    quotations.map((q) => ({
      quotationId: q.id,
      slug: q.slug,
      documentNo: q.documentNo,
      customerId: q.customerId,
      customerName: q.customer.name,
      phone: q.customer.phone,
      contactPerson: q.customer.contactPerson,
      salesEmployeeId: q.createdBy,
      salesEmployeeName: q.createdBy ? (sellerNameById.get(q.createdBy) ?? null) : null,
      date: q.date,
      validUntil: q.validUntil,
      grandTotal: Number(q.grandTotal),
    })),
    now,
  )
}
