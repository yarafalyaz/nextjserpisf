export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Receipt } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { ReportDateFilter } from "@/components/reports/report-date-filter"

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.startDate ? new Date(params.startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.endDate ? new Date(params.endDate) : now

  // PPN Keluaran (Output Tax) - from Sales Invoices
  const salesInvoices = await prisma.salesInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
      deletedAt: null,
      tax: { gt: 0 },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'asc' },
  })

  const outputTaxRows = salesInvoices.map(inv => ({
    date: inv.date,
    documentNo: inv.documentNo,
    party: inv.customer.name,
    dpp: Number(inv.subtotal) - Number(inv.discount),
    tax: Number(inv.tax),
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
  const period = `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Laporan Pajak (PPN)" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/laporan" },
        { label: "Tax Report" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Receipt size={24} />
          <h1>Laporan Pajak (PPN)</h1>
        </div>
        <ExportButtons title="Laporan_Pajak" />
      </div>

      <ReportDateFilter defaultStartDate={startDate.toISOString().split('T')[0]} defaultEndDate={endDate.toISOString().split('T')[0]} />

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">PPN Keluaran</div>
          <div className="text-xl font-bold">{formatCurrency(totalOutputTax)}</div>
          <div className="text-xs text-muted">{outputTaxRows.length} faktur</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">PPN Masukan</div>
          <div className="text-xl font-bold">{formatCurrency(totalInputTax)}</div>
          <div className="text-xs text-muted">{inputTaxRows.length} faktur</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">PPN Kurang (Lebih) Bayar</div>
          <div className={`text-xl font-bold ${netTax >= 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.abs(netTax))}</div>
          <div className="text-xs text-muted">{netTax >= 0 ? 'Kurang Bayar' : 'Lebih Bayar'}</div>
        </div>
      </div>

      {/* PPN Keluaran */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PPN KELUARAN (Output Tax)</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="PPN Keluaran">
            <DetailTableHead>
              <DetailTableTh>Tanggal</DetailTableTh>
              <DetailTableTh>No. Faktur</DetailTableTh>
              <DetailTableTh>Customer</DetailTableTh>
              <DetailTableTh align="right">DPP</DetailTableTh>
              <DetailTableTh align="right">PPN</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {outputTaxRows.map((row, i) => (
                <DetailTableRow key={i}>
                  <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                  <DetailTableTd>{row.party}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.dpp)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.tax)}</DetailTableTd>
                </DetailTableRow>
              ))}
              {outputTaxRows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted py-6">Tidak ada PPN Keluaran</DetailTableTd></DetailTableRow>
              )}
              {outputTaxRows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalOutputDPP)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalOutputTax)}</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* PPN Masukan */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PPN MASUKAN (Input Tax)</h2>
        </div>
        <div className="p-4 px-5">
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
                  <DetailTableTd align="right">{formatCurrency(row.dpp)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.tax)}</DetailTableTd>
                </DetailTableRow>
              ))}
              {inputTaxRows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted py-6">Tidak ada PPN Masukan</DetailTableTd></DetailTableRow>
              )}
              {inputTaxRows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalInputDPP)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalInputTax)}</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Summary */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center justify-between shadow-sm border-2 ${netTax >= 0 ? 'border-danger' : 'border-success'}`}>
        <span className="text-lg font-bold">PPN {netTax >= 0 ? 'KURANG BAYAR' : 'LEBIH BAYAR'}</span>
        <span className={`text-2xl font-bold ${netTax >= 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.abs(netTax))}</span>
      </div>
    </div>
  )
}
