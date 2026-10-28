export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { RECOGNISED_AP_STATUSES } from "@/lib/reports/document-status"
import { AgingReportView, buildAgingRows } from "@/components/reports/aging-report-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Hutang Jatuh Tempo" }

export default async function AgingPayablesPage() {
  await requirePermission('view_reports')

  // Only posted/partial/paid bills are real payables.
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const rows = buildAgingRows(
    bills.map((bill) => ({
      party: bill.vendor.name,
      documentNo: bill.documentNo,
      dueDate: bill.dueDate,
      grandTotal: bill.grandTotal,
      paidAmount: bill.paidAmount,
      withholdingAmount: bill.withholdingAmount,
    })),
    new Date(),
  )

  return (
    <AgingReportView
      rows={rows}
      texts={{
        pageTitle: "Hutang Jatuh Tempo",
        exportTitle: "Hutang_Jatuh_Tempo",
        pdfSlug: "hutang-jatuh-tempo",
        letterheadSubtitle: "Umur Utang",
        narration: "Laporan Utang Jatuh Tempo mengelompokkan utang usaha berdasarkan umur jatuh temponya. Informasi ini penting untuk mengelola jadwal pembayaran, menjaga hubungan baik dengan pemasok, dan mengoptimalkan arus kas perusahaan.",
        kpiLabel: "Total Hutang",
        summaryTitle: "Ringkasan Umur Hutang",
        chartTitle: "Grafik Umur Hutang",
        chartValueLabel: "Nilai Hutang",
        chartAriaLabel: "Grafik umur hutang per kategori umur",
        detailTitle: "Detail Hutang",
        partyHeader: "Pemasok",
        documentHeader: "No. Tagihan",
        emptyText: "Tidak ada hutang jatuh tempo",
        outstandingClassName: "font-semibold text-danger",
      }}
    />
  )
}
