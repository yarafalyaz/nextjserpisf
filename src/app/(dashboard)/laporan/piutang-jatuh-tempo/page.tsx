export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { AgingReportView, buildAgingRows } from "@/components/reports/aging-report-view"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Piutang Jatuh Tempo" }

export default async function AgingReceivablesPage() {
  await requirePermission('view_reports')

  // Only posted/partial/paid invoices are real receivables (drafts/sent/approved
  // are not yet issued).
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  // F-104-V: sisa layar kurangi returnCredit per faktur (helper bersama
  // Backend PR #748 — definisi outstanding tunggal; paidAmount tetap murni).
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))

  const rows = buildAgingRows(
    invoices.map((inv) => ({
      party: inv.customer.name,
      documentNo: salesInvoiceLabel(inv),
      dueDate: inv.dueDate,
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      returnCreditAmount: returnCreditByInvoiceId.get(inv.id) ?? 0,
    })),
    new Date(),
  )

  return (
    <AgingReportView
      rows={rows}
      texts={{
        pageTitle: "Piutang Jatuh Tempo",
        exportTitle: "Piutang_Jatuh_Tempo",
        pdfSlug: "piutang-jatuh-tempo",
        letterheadSubtitle: "Umur Piutang",
        narration: "Laporan Piutang Jatuh Tempo mengelompokkan piutang usaha berdasarkan umur jatuh temponya. Analisis aging piutang membantu mengidentifikasi risiko keterlambatan pembayaran dan mengevaluasi efektivitas penagihan kepada pelanggan.",
        kpiLabel: "Total Piutang",
        summaryTitle: "Ringkasan Umur Piutang",
        chartTitle: "Grafik Umur Piutang",
        chartValueLabel: "Nilai Piutang",
        chartAriaLabel: "Grafik umur piutang per kategori umur",
        detailTitle: "Detail Piutang",
        partyHeader: "Pelanggan",
        documentHeader: "No. Faktur",
        emptyText: "Tidak ada piutang jatuh tempo",
        outstandingClassName: "font-semibold text-primary",
        wrapActionsInDiv: true,
      }}
    />
  )
}
