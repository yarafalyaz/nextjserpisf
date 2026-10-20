export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { loadWithholdingCertificatesCsv } from "@/lib/reports/withholding-certificates-data"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Bukti Potong PPh" }

/**
 * Daftar bukti potong PPh — DUA sisi:
 *
 * - **Pembelian**: tagihan vendor yang dipotong (`VendorBill.withholdingTypeId` +
 *   `withholdingAmount`), dijurnal saat tagihan diposting (Cr Hutang PPh).
 * - **Penjualan**: PPh yang dipotong PELANGGAN atas pembayaran
 *   (`SalesPayment.withholdingAmount`), tercatat saat pembayaran diterima dan
 *   dijurnal Dr PPh dibayar dimuka / Cr Piutang.
 *
 * Keduanya ditampilkan terpisah, bukan digabung dalam satu total: arahnya
 * berlawanan (pajak yang kita setor vs pajak yang kita kreditkan), jadi
 * menjumlahkannya akan menyesatkan.
 */
export default async function WithholdingTaxReportPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requireAnyPermission(["view_payroll_reports", "view_reports"])

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  const bills = await prisma.vendorBill.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ["posted", "partial", "paid"] },
      deletedAt: null,
      withholdingAmount: { gt: 0 },
    },
    include: {
      vendor: { select: { name: true } },
      withholdingType: { select: { code: true, name: true, rate: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })

  const rows = bills.map((bill) => ({
    id: bill.id,
    date: bill.date,
    documentNo: bill.documentNo,
    vendorName: bill.vendor.name,
    typeCode: bill.withholdingType?.code ?? null,
    typeName: bill.withholdingType?.name ?? null,
    rate: bill.withholdingType ? Number(bill.withholdingType.rate) : null,
    // Dasar pengenaan = subtotal − diskon (di luar PPN).
    dpp: Number(bill.subtotal) - Number(bill.discountAmount ?? 0),
    withheld: Number(bill.withholdingAmount),
  }))

  const byType = new Map<string, { label: string; rate: number | null; count: number; amount: number }>()
  for (const row of rows) {
    const key = row.typeCode ?? "__tanpa_jenis__"
    const bucket = byType.get(key) ?? {
      label: row.typeCode ? `${row.typeCode} — ${row.typeName}` : "Jenis PPh tidak ditemukan",
      rate: row.rate,
      count: 0,
      amount: 0,
    }
    bucket.count += 1
    bucket.amount += row.withheld
    byType.set(key, bucket)
  }

  const totalWithheld = rows.reduce((sum, row) => sum + row.withheld, 0)
  const totalDpp = rows.reduce((sum, row) => sum + row.dpp, 0)

  // Sisi penjualan: PPh yang dipotong pelanggan, tercatat di pembayaran.
  const salesPayments = await prisma.salesPayment.findMany({
    where: {
      paymentDate: { gte: startDate, lte: endDate },
      withholdingAmount: { gt: 0 },
    },
    include: {
      salesInvoice: { select: { documentNo: true, customer: { select: { name: true } } } },
      withholdingType: { select: { code: true, name: true, rate: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { documentNo: "asc" }],
  })

  const salesRows = salesPayments.map((payment) => ({
    id: payment.id,
    date: payment.paymentDate,
    documentNo: payment.documentNo,
    certificateNo: payment.withholdingCertificateNo,
    invoiceNo: payment.salesInvoice?.documentNo ?? null,
    customerName: payment.salesInvoice?.customer?.name ?? null,
    typeCode: payment.withholdingType?.code ?? null,
    typeName: payment.withholdingType?.name ?? null,
    rate: payment.withholdingType ? Number(payment.withholdingType.rate) : null,
    withheld: Number(payment.withholdingAmount),
  }))

  const totalSalesWithheld = salesRows.reduce((sum, row) => sum + row.withheld, 0)
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <ReportPageShell title="Bukti Potong PPh" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/bukti-potong-pph"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Bukti_Potong_PPh" pdfHref={buildReportPdfHref("bukti-potong-pph", period.slug)} csvData={(await loadWithholdingCertificatesCsv(period)).csv} /></div>
</>}>



      <ReportLetterhead title="Daftar Bukti Potong PPh" subtitle="Pemotongan PPh atas Tagihan Pemasok" periodLabel={periodLabel} />
      <ReportNarration text="Daftar Bukti Potong PPh memuat dua sisi. Sisi pembelian: pemotongan PPh yang dilakukan perusahaan atas tagihan pemasok, dikelompokkan per jenis potongan — nilainya diambil dari tagihan yang sudah diposting, sehingga sama dengan jurnal Hutang PPh. Sisi penjualan: PPh yang dipotong pelanggan atas pembayaran kita, tercatat saat pembayaran diterima dan berpasangan dengan jurnal PPh dibayar dimuka; nilainya bukan kas yang diterima, melainkan bagian pelunasan piutang yang ditahan pelanggan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Jumlah Bukti Potong" value={rows.length.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Dasar Pengenaan" value={formatCurrency(totalDpp)} />
        <ReportKpiCard label="Total PPh Dipotong (Pembelian)" value={formatCurrency(totalWithheld)} valueClassName="text-primary" />
        <ReportKpiCard label="PPh Dipotong Pelanggan (Penjualan)" value={formatCurrency(totalSalesWithheld)} valueClassName="text-primary" />
      </div>

      <ReportSection title="Rekap per Jenis PPh">
        <DetailTable data-report-table="Rekap Jenis PPh">
          <DetailTableHead>
            <DetailTableTh>Jenis PPh</DetailTableTh>
            <DetailTableTh align="right">Tarif</DetailTableTh>
            <DetailTableTh align="right">Jumlah Tagihan</DetailTableTh>
            <DetailTableTh align="right">Total Dipotong</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {[...byType.entries()].map(([key, bucket]) => (
              <DetailTableRow key={key}>
                <DetailTableTd>{bucket.label}</DetailTableTd>
                <DetailTableTd align="right">{bucket.rate === null ? "–" : `${bucket.rate.toLocaleString('id-ID')}%`}</DetailTableTd>
                <DetailTableTd align="right">{bucket.count.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(bucket.amount)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {byType.size === 0 && (
              <DetailTableRow><DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6">Tidak ada pemotongan PPh pada periode ini</DetailTableTd></DetailTableRow>
            )}
            {byType.size > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{rows.length.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalWithheld)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Rincian Bukti Potong">
        <DetailTable data-report-table="Rincian Bukti Potong">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>No. Tagihan</DetailTableTh>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh>Jenis PPh</DetailTableTh>
            <DetailTableTh align="right">Tarif</DetailTableTh>
            <DetailTableTh align="right">Dasar Pengenaan</DetailTableTh>
            <DetailTableTh align="right">PPh Dipotong</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.id}>
                <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{row.documentNo}</DetailTableTd>
                <DetailTableTd>{row.vendorName}</DetailTableTd>
                <DetailTableTd className={row.typeCode ? undefined : "text-danger"}>
                  {row.typeCode ? `${row.typeCode} — ${row.typeName}` : "Jenis PPh tidak ditemukan"}
                </DetailTableTd>
                <DetailTableTd align="right">{row.rate === null ? "–" : `${row.rate.toLocaleString('id-ID')}%`}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.dpp)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.withheld)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={7} className="text-center text-muted-foreground py-6">Tidak ada tagihan pemasok dengan pemotongan PPh pada periode ini</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={5}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalDpp)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalWithheld)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Pemotongan PPh oleh Pelanggan (Sisi Penjualan)">
        <DetailTable data-report-table="Bukti Potong PPh Penjualan">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>No. Pembayaran</DetailTableTh>
            <DetailTableTh>No. Bukti Potong</DetailTableTh>
            <DetailTableTh>Faktur</DetailTableTh>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>Jenis PPh</DetailTableTh>
            <DetailTableTh align="right">Tarif</DetailTableTh>
            <DetailTableTh align="right">PPh Dipotong</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {salesRows.map((row) => (
              <DetailTableRow key={row.id}>
                <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{row.documentNo}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{row.certificateNo ?? "–"}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{row.invoiceNo ?? "–"}</DetailTableTd>
                <DetailTableTd>{row.customerName ?? "–"}</DetailTableTd>
                <DetailTableTd className={row.typeCode ? undefined : "text-danger"}>
                  {row.typeCode ? `${row.typeCode} — ${row.typeName}` : "Jenis PPh tidak ditemukan"}
                </DetailTableTd>
                <DetailTableTd align="right">{row.rate === null ? "–" : `${row.rate.toLocaleString('id-ID')}%`}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.withheld)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {salesRows.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={8} className="text-center text-muted-foreground py-6">
                  Tidak ada PPh yang dipotong pelanggan pada periode ini. Potongan dicatat saat menerima
                  pembayaran (Penjualan → Pembayaran → terima pembayaran).
                </DetailTableTd>
              </DetailTableRow>
            )}
            {salesRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={7}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalSalesWithheld)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
