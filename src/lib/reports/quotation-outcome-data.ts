/**
 * Loader read-only laporan hasil penawaran (F-2026-10-20-101, tahap laporan).
 *
 * Penawaran yang tanggalnya masuk periode dibaca massal; status akhir +
 * histori penolakan terbaru + keberadaan pesanan penjualan/perintah kerja
 * diturunkan ke builder murni `buildQuotationOutcomeSummary`. Tanpa mutasi,
 * tanpa jurnal. Penolakan lama tanpa awalan `[kalah:...]` tidak ditebak —
 * builder mengelompokkannya sebagai `tak-tercatat`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildQuotationOutcomeSummary,
  type QuotationOutcomeSummary,
} from "@/lib/reports/quotation-outcome"

export async function getQuotationOutcome(period: {
  start: Date
  end: Date
}): Promise<QuotationOutcomeSummary> {
  const quotations = await prisma.quotation.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      id: true,
      status: true,
      histories: {
        where: { action: "rejected" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { description: true },
      },
      salesOrders: {
        where: { deletedAt: null, status: { not: "cancelled" } },
        take: 1,
        select: { id: true },
      },
      workOrders: {
        take: 1,
        select: { id: true },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  return buildQuotationOutcomeSummary(
    quotations.map((quotation) => ({
      status: quotation.status,
      rejectionDescription: quotation.histories[0]?.description ?? null,
      hasConversion: quotation.salesOrders.length > 0 || quotation.workOrders.length > 0,
    })),
  )
}
