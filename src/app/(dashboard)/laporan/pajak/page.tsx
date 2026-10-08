export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pajak" }

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.tanggalMulai ? new Date(params.tanggalMulai) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  // Clamp to end-of-day: without this, `date <= endDate` at midnight silently
  // drops every invoice/bill dated ON the end date (every other report clamps).
  endDate.setHours(23, 59, 59, 999)

  // PPN is only recognised on invoices that were actually ISSUED (posted), not
  // on draft/sent/approved ones that carry no tax liability yet. Filtering
  // `not cancelled` previously pulled drafts into the SPT.
  const salesInvoices = await prisma.salesInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['posted', 'partial', 'paid'] },
      deletedAt: null,
      taxAmount: { gt: 0 },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'asc' },
  })

  const outputTaxRows = salesInvoices.map(inv => ({
    date: inv.date,
    documentNo: inv.documentNo,
    party: inv.customer.name,
    dpp: Number(inv.subtotal) - Number(inv.discount),
    tax: Number(inv.taxAmount),
  }))
  const totalOutputDPP = outputTaxRows.reduce((s, r) => s + r.dpp, 0)
  const totalOutputTax = outputTaxRows.reduce((s, r) => s + r.tax, 0)

  // Input VAT is recognised on bills that were posted (received), not draft.
  const vendorBills = await prisma.vendorBill.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['posted', 'partial', 'paid'] },
      deletedAt: null,
      tax: { gt: 0 },
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { date: 'asc' },
  })

  const inputTaxRows = vendorBills.map(bill => ({
    date: bill.date,
    documentNo: bill.documentNo,
    party: bill.vendor.name,
    // DPP = taxable base = subtotal − discount (mirror the sales side above).
    dpp: Number(bill.subtotal) - Number(bill.discountAmount ?? 0),
    tax: Number(bill.tax),
  }))
  const totalInputDPP = inputTaxRows.reduce((s, r) => s + r.dpp, 0)
  const totalInputTax = inputTaxRows.reduce((s, r) => s + r.tax, 0)

  const netTax = totalOutputTax - totalInputTax
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Laporan Pajak" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Laporan_Pajak" />
      </div>

      <div className="print:hidden">
        <ReportDateFilter defaultStartDate={startDate.toISOString().split('T')[0]} defaultEndDate={endDate.toISOString().split('T')[0]} />
      </div>

      <ReportLetterhead title="Laporan Pajak (PPN)" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Pajak menyajikan ringkasan seluruh transaksi perpajakan yang dicatat selama periode berjalan, termasuk Pajak Masukan (PPN Masukan) dan Pajak Keluaran (PPN Keluaran). Laporan ini memudahkan dalam penyusunan Surat Pemberitahuan (SPP) Masa PPN." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="PPN Keluaran" value={formatCurrency(totalOutputTax)} />
        <ReportKpiCard label="PPN Masukan" value={formatCurrency(totalInputTax)} />
        <ReportKpiCard
          label={netTax >= 0 ? 'PPN Kurang Bayar' : 'PPN Lebih Bayar'}
          value={formatCurrency(Math.abs(netTax))}
          valueClassName={netTax >= 0 ? 'text-danger' : 'text-success'}
        />
      </div>

      <ReportSection title="PPN Keluaran">
        <DetailTable data-report-table="PPN Keluaran">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>No. Faktur</DetailTableTh>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh align="right">DPP</DetailTableTh>
            <DetailTableTh align="right">PPN</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {outputTaxRows.map((row, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                <DetailTableTd>{row.party}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.dpp)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.tax)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {outputTaxRows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada PPN Keluaran</DetailTableTd></DetailTableRow>
            )}
            {outputTaxRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutputDPP)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutputTax)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="PPN Masukan">
        <DetailTable data-report-table="PPN Masukan">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>No. Faktur</DetailTableTh>
            <DetailTableTh>Vendor</DetailTableTh>
            <DetailTableTh align="right">DPP</DetailTableTh>
            <DetailTableTh align="right">PPN</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {inputTaxRows.map((row, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                <DetailTableTd>{row.party}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.dpp)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.tax)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {inputTaxRows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada PPN Masukan</DetailTableTd></DetailTableRow>
            )}
            {inputTaxRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalInputDPP)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalInputTax)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <div className={`report-section ${netTax >= 0 ? 'border-danger' : 'border-success'}`} style={{ borderLeft: '4px solid', paddingLeft: 16 }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">PPN {netTax >= 0 ? 'KURANG BAYAR' : 'LEBIH BAYAR'}</span>
          <span className={`text-base font-bold ${netTax >= 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.abs(netTax))}</span>
        </div>
      </div>
    </div>
  )
}
