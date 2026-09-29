export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ringkasan AR/AP" }

export default async function ArApSummaryPage() {
  await requirePermission('view_reports')

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { notIn: ['draft', 'cancelled'] }, deletedAt: null },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const arByCustomer = new Map<number, { name: string; totalInvoiced: number; totalPaid: number; outstanding: number; count: number }>()
  for (const inv of invoices) {
    const existing = arByCustomer.get(inv.customerId) || { name: inv.customer.name, totalInvoiced: 0, totalPaid: 0, outstanding: 0, count: 0 }
    const invoiced = Number(inv.grandTotal)
    const paid = Number(inv.paidAmount)
    existing.totalInvoiced += invoiced
    existing.totalPaid += paid
    existing.outstanding += invoiced - paid
    existing.count++
    arByCustomer.set(inv.customerId, existing)
  }
  const arRows = Array.from(arByCustomer.values()).filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
  const totalAR = arRows.reduce((s, r) => s + r.outstanding, 0)

  const bills = await prisma.vendorBill.findMany({
    where: { status: { notIn: ['draft', 'cancelled'] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const apByVendor = new Map<number, { name: string; totalBilled: number; totalPaid: number; outstanding: number; count: number }>()
  for (const bill of bills) {
    const existing = apByVendor.get(bill.vendorId) || { name: bill.vendor.name, totalBilled: 0, totalPaid: 0, outstanding: 0, count: 0 }
    const billed = Number(bill.grandTotal)
    const paid = Number(bill.paidAmount)
    existing.totalBilled += billed
    existing.totalPaid += paid
    existing.outstanding += billed - paid
    existing.count++
    apByVendor.set(bill.vendorId, existing)
  }
  const apRows = Array.from(apByVendor.values()).filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
  const totalAP = apRows.reduce((s, r) => s + r.outstanding, 0)

  const period = `Per ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Ringkasan AR/AP" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Ringkasan_AR_AP" />
      </div>

      <ReportLetterhead title="Ringkasan Piutang & Hutang" periodLabel={period} />
      <ReportNarration text="Laporan Ringkasan Piutang dan Utang menyajikan ikhtisar saldo piutang usaha dan utang usaha perusahaan. Informasi ini penting untuk mengelola arus kas dan memastikan kewajiban pembayaran kepada pemasok serta tagihan kepada pelanggan terpantau dengan baik." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Piutang (AR)" value={formatCurrency(totalAR)} valueClassName="text-primary" />
        <ReportKpiCard label="Total Hutang (AP)" value={formatCurrency(totalAP)} valueClassName="text-danger" />
        <ReportKpiCard
          label="Posisi Bersih"
          value={formatCurrency(totalAR - totalAP)}
          valueClassName={totalAR - totalAP >= 0 ? 'text-success' : 'text-danger'}
        />
      </div>

      <ReportSection title="Piutang Usaha">
        <DetailTable data-report-table="Accounts Receivable">
          <DetailTableHead>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh align="right">Jumlah Faktur</DetailTableTh>
            <DetailTableTh align="right">Total Tagihan</DetailTableTh>
            <DetailTableTh align="right">Sudah Dibayar</DetailTableTh>
            <DetailTableTh align="right">Belum Lunas</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {arRows.map((row, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd align="right">{row.count}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalInvoiced)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalPaid)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-primary">{formatAccounting(row.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {arRows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada piutang belum lunas</DetailTableTd></DetailTableRow>
            )}
            {arRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{arRows.reduce((s, r) => s + r.count, 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(arRows.reduce((s, r) => s + r.totalInvoiced, 0))}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(arRows.reduce((s, r) => s + r.totalPaid, 0))}</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatAccounting(totalAR)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Hutang Usaha">
        <DetailTable data-report-table="Accounts Payable">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh align="right">Jumlah Tagihan</DetailTableTh>
            <DetailTableTh align="right">Total Tagihan</DetailTableTh>
            <DetailTableTh align="right">Sudah Dibayar</DetailTableTh>
            <DetailTableTh align="right">Belum Lunas</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {apRows.map((row, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd align="right">{row.count}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalBilled)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalPaid)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{formatAccounting(row.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {apRows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada hutang belum lunas</DetailTableTd></DetailTableRow>
            )}
            {apRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{apRows.reduce((s, r) => s + r.count, 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(apRows.reduce((s, r) => s + r.totalBilled, 0))}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(apRows.reduce((s, r) => s + r.totalPaid, 0))}</DetailTableTd>
                <DetailTableTd align="right" className="text-danger">{formatAccounting(totalAP)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
