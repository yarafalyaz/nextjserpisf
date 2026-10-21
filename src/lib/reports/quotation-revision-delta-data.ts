/**
 * Loader read-only selisih revisi penawaran (F-2026-10-20-103 lapis aman).
 *
 * Dua query: penawaran (grandTotal berjalan + revisionNumber) dan
 * QuotationHistory snapshot TERAKHIR (revisionNumber desc). Snapshot
 * ditulis reviseQuotation dengan dataSnapshot.grandTotal (sen Decimal
 * tersimpan sebagai Json number/string — dibaca defensif, tak terbaca =
 * tanpa snapshot, bukan ditebak). Tanpa mutasi, tanpa jurnal, tanpa
 * memanggil createDifferenceInvoice/createRevisionDownCredit.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildQuotationRevisionDelta,
  type QuotationRevisionDelta,
} from "@/lib/reports/quotation-revision-delta"

function snapshotGrandTotal(snapshot: unknown): number | null {
  if (snapshot === null || typeof snapshot !== "object") return null
  const raw = (snapshot as { grandTotal?: unknown }).grandTotal
  const value = typeof raw === "string" ? Number(raw) : raw
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export async function getQuotationRevisionDelta(
  quotationId: number,
): Promise<QuotationRevisionDelta | null> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, grandTotal: true, revisionNumber: true },
  })
  if (!quotation) return null

  const history = await prisma.quotationHistory.findFirst({
    where: { quotationId, action: "revised" },
    orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
    select: { revisionNumber: true, dataSnapshot: true },
  })

  return buildQuotationRevisionDelta({
    quotationId: quotation.id,
    revisionNumber: history?.revisionNumber ?? quotation.revisionNumber,
    snapshotGrandTotal: history ? snapshotGrandTotal(history.dataSnapshot) : null,
    currentGrandTotal: Number(quotation.grandTotal),
  })
}
