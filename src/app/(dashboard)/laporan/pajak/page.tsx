export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

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

  // PPN Keluaran (Output Tax) - from Sales Invoices.
  // Filter/sum on taxAmount (the computed PPN value), NOT `tax`: on a
  // SalesInvoice `tax` stores the RATE (e.g. 11), while taxAmount holds the
  // actual money — same field the GL posting uses. Reading `tax` here showed
  // the rate as the PPN amount and broke the filed VAT return.
  const salesInvoices = await prisma.salesInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
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

  // PPN Masukan (Input Tax) - from Vendor Bills
  const vendorBills = await prisma.vendorBill.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
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
    dpp: Number(bill.subtotal),
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

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Laporan Pajak (PPN)" periodLabel={periodLabel} />

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">PPN Keluaran</div>
          <div className="text-xl font-bold">{formatCurrency(totalOutputTax)}</div>
          <div className="text-xs text-muted-foreground">{outputTaxRows.length} faktur</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">PPN Masukan</div>
          <div className="text-xl font-bold">{formatCurrency(totalInputTax)}</div>
          <div className="text-xs text-muted-foreground">{inputTaxRows.length} faktur</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">PPN Kurang (Lebih) Bayar</div>
          <div className={`text-xl font-bold ${netTax >= 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.abs(netTax))}</div>
          <div className="text-xs text-muted-foreground">{netTax >= 0 ? 'Kurang Bayar' : 'Lebih Bayar'}</div>
        </div>
      </div>

      {/* PPN Keluaran */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PPN KELUARAN</h2>
        </div>
        <div className="p-4 px-5">
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
        </div>
      </div>

      {/* PPN Masukan */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PPN MASUKAN</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="PPN Masukan">
            <DetailTableHead>
              <DetailTableTh>Tanggal</DetailTableTh>
              <DetailTableTh>No. Faktur</DetailTableTh>
              <DetailTableTh>Pemasok</DetailTableTh>
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
        </div>
      </div>

      {/* Summary */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center justify-between shadow-sm border-2 no-break ${netTax >= 0 ? 'border-danger' : 'border-success'}`}>
        <span className="text-lg font-bold">PPN {netTax >= 0 ? 'KURANG BAYAR' : 'LEBIH BAYAR'}</span>
        <span className={`text-2xl font-bold ${netTax >= 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.abs(netTax))}</span>
      </div>
    </div>
  )
}
