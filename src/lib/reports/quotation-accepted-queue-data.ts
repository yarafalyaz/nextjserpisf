/**
 * Loader read-only antrean penawaran diterima belum dikonversi
 * (F-2026-10-25-002-S tahap 1, NOL migrasi, PUTUSAN LEAD §12 PR #765).
 *
 * Query massal anti-N+1: satu query quotation accepted/approved belum
 * terhapus, lalu satu query massal per sumber pendamping difilter
 * quotationId IN (...) — SalesOrder, WorkOrder, SalesInvoice,
 * DownPayment, QuotationHistory (peristiwa terima), Employee (penjual).
 * Nol query per baris.
 *
 * Fisik Q-AQ-3: waktu terima = QuotationHistory action "accepted"
 * terakhir yang revisionNumber-nya sama dengan revisionNumber berjalan
 * quotation (peristiwa revisi lama tidak dipakai, EC-7). Tidak ada =
 * acceptedAt null -> builder menandai umur "tidak tercatat" (EC-5).
 * updatedAt TIDAK dipakai sebagai sumber umur (AC-AQ-B4).
 *
 * Izin `view_quotations` ditegakkan page pemanggil (requirePermission)
 * sebelum loader ini dipanggil — pola quotation-followup-queue-data.ts.
 * Hanya baca: nol mutasi quotation/status/dokumen apa pun (AC-AQ-B6).
 * Ekspor tahap 1 tanpa kontak: pemanggil ekspor memakai field non-kontak
 * (BR-AQ-12); loader ini satu-satunya jalur kontak untuk antrean berizin.
 */

import { prisma } from "@/lib/db/prisma"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import {
  buildAcceptedQuotationQueue,
  type AcceptedQuotationInput,
  type AcceptedQuotationRow,
} from "@/lib/reports/quotation-accepted-queue"

type DocRef = { id: number; documentNo: string; status: string }

function groupByQuotationId<T extends { quotationId: number | null }>(
  rows: T[],
): Map<number, T[]> {
  const byId = new Map<number, T[]>()
  for (const row of rows) {
    if (row.quotationId == null) continue
    const list = byId.get(row.quotationId) ?? []
    list.push(row)
    byId.set(row.quotationId, list)
  }
  return byId
}

function toDocRefs(rows: { id: number; documentNo: string; status: string }[]): DocRef[] {
  return rows.map((r) => ({ id: r.id, documentNo: r.documentNo, status: r.status }))
}

export async function getAcceptedQuotationQueue(
  now: Date = new Date(),
): Promise<AcceptedQuotationRow[]> {
  const quotations = await prisma.quotation.findMany({
    where: { status: { in: ["accepted", "approved"] }, deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      revisionNumber: true,
      customerId: true,
      salesEmployeeId: true,
      date: true,
      validUntil: true,
      grandTotal: true,
      customer: { select: { name: true, phone: true, contactPerson: true } },
      salesEmployee: { select: { name: true } },
      customerVehicle: {
        select: { plateNumber: true, vehicle: { select: { name: true } } },
      },
    },
    orderBy: [{ documentNo: "asc" }, { id: "asc" }],
  })

  if (quotations.length === 0) return []

  const quotationIds = quotations.map((q) => q.id)
  const revisionById = new Map(quotations.map((q) => [q.id, q.revisionNumber]))

  const [salesOrders, workOrders, salesInvoices, downPayments, histories] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: { quotationId: { in: quotationIds }, deletedAt: null },
        select: { id: true, documentNo: true, status: true, quotationId: true },
      }),
      // WorkOrder tidak punya deletedAt di schema — semua baris tertaut fakta.
      prisma.workOrder.findMany({
        where: { quotationId: { in: quotationIds } },
        select: { id: true, documentNo: true, status: true, quotationId: true },
      }),
      prisma.salesInvoice.findMany({
        where: { quotationId: { in: quotationIds }, deletedAt: null },
        select: { id: true, documentNo: true, status: true, quotationId: true },
      }),
      prisma.downPayment.findMany({
        where: { quotationId: { in: quotationIds }, status: { in: ["pending", "confirmed"] } },
        select: {
          id: true,
          documentNo: true,
          status: true,
          amount: true,
          quotationId: true,
        },
      }),
      prisma.quotationHistory.findMany({
        where: { quotationId: { in: quotationIds }, action: "accepted" },
        select: { quotationId: true, revisionNumber: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ])

  const soByQuotation = groupByQuotationId(salesOrders)
  const woByQuotation = groupByQuotationId(workOrders)
  const invByQuotation = groupByQuotationId(salesInvoices)
  const dpByQuotation = groupByQuotationId(downPayments)

  // Peristiwa terima terakhir per quotation untuk revisi berjalan saja.
  const acceptedAtById = new Map<number, Date>()
  for (const h of histories) {
    if (acceptedAtById.has(h.quotationId)) continue
    if (h.revisionNumber !== revisionById.get(h.quotationId)) continue
    acceptedAtById.set(h.quotationId, h.createdAt)
  }

  const inputs: AcceptedQuotationInput[] = quotations.map((q) => {
    const vehicleParts = q.customerVehicle
      ? [q.customerVehicle.plateNumber, q.customerVehicle.vehicle?.name].filter(
          (part): part is string => typeof part === "string" && part.length > 0,
        )
      : []
    return {
      quotationId: q.id,
      slug: q.slug,
      documentNo: q.documentNo,
      status: q.status,
      customerId: q.customerId,
      customerName: q.customer.name,
      phone: q.customer.phone,
      contactPerson: q.customer.contactPerson,
      salesEmployeeId: q.salesEmployeeId,
      salesEmployeeName: q.salesEmployee?.name ?? null,
      customerVehicleLabel: vehicleParts.length ? vehicleParts.join(" · ") : null,
      date: q.date,
      validUntil: q.validUntil,
      grandTotal: Number(q.grandTotal),
      acceptedAt: acceptedAtById.get(q.id) ?? null,
      salesOrders: toDocRefs(soByQuotation.get(q.id) ?? []),
      workOrders: toDocRefs(woByQuotation.get(q.id) ?? []),
      salesInvoices: toDocRefs(
        (invByQuotation.get(q.id) ?? []).map((r) => ({
          ...r,
          documentNo: salesInvoiceLabel(r),
          status: String(r.status),
        })),
      ),
      downPayments: (dpByQuotation.get(q.id) ?? []).map((dp) => ({
        id: dp.id,
        documentNo: dp.documentNo,
        status: dp.status,
        amount: Number(dp.amount),
      })),
    }
  })

  return buildAcceptedQuotationQueue(inputs, now)
}
