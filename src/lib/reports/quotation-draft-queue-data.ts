/**
 * Loader read-only antrean draf penawaran basi belum terkirim
 * (F-2026-10-26-055-S / 055-B, NOL migrasi).
 *
 * Izin `view_quotations` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (Q-QD-4 Lead, PR #965 — tanpa key izin baru); halaman pemanggil
 * menegakkannya juga sebelum loader. Tanpa izin: nol baris bocor (AC-QD-5).
 *
 * Populasi query = Quotation `status: "draft"` + `deletedAt: null`
 * (BR-QD-01); builder menyaring ulang lapis kedua supaya kontrak turunan
 * tidak bergantung pada query saja. Satu query massal penawaran (+ nama
 * pelanggan lewat relasi) + satu query massal nama penjual dari
 * `salesEmployeeId` -> Employee (Q-QD-5 diratifikasi Lead: sumber kanonik
 * SATU jalur; null = `—`, dilarang fallback ke `createdBy`/User) — tanpa
 * N+1. Tanpa hitung item (Q-QD-6: draf item-0 tampil polos).
 *
 * Baca-saja mutlak: nol mutasi status/validUntil/dokumen/jurnal (BR-QD-05).
 * Kontak pelanggan (phone/contactPerson) TIDAK dibaca di sini; ekspor
 * tahap 1 tanpa kontak (BR-QD-07, Q-QD-4).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildQuotationDraftQueue,
  countQuotationDraftStages,
  QUOTATION_DRAFT_NOTICE_TEXT,
  QUOTATION_DRAFT_STAGE_LABELS,
  type QuotationDraftRow,
  type QuotationDraftStage,
} from "@/lib/reports/quotation-draft-queue"

export interface QuotationDraftQueue {
  rows: QuotationDraftRow[]
  stageCounts: Record<QuotationDraftStage, number>
  totalDocuments: number
  noticeText: string
  stageLabels: Record<QuotationDraftStage, string>
}

export async function getQuotationDraftQueue(
  now: Date = new Date(),
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
    new Set(quotations.map((q) => q.salesEmployeeId).filter((id) => id != null)),
  )
  const sellers =
    sellerIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : []
  const sellerNameById = new Map(sellers.map((e) => [e.id, e.name]))

  const rows = buildQuotationDraftQueue(
    quotations.map((q) => ({
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
    })),
    now,
  )

  return {
    rows,
    stageCounts: countQuotationDraftStages(rows),
    totalDocuments: rows.length,
    noticeText: QUOTATION_DRAFT_NOTICE_TEXT,
    stageLabels: QUOTATION_DRAFT_STAGE_LABELS,
  }
}
