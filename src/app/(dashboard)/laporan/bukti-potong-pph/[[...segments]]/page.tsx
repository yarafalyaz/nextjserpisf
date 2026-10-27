export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { serializeWithholdingCertificatesCsv } from "@/lib/reports/withholding-certificates"
import { loadWithholdingCertificateInputs } from "@/lib/reports/withholding-certificates-data"
import { safeAdd } from "@/lib/utils/math"

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
  // Laporan pajak pemasok (VendorBill dipotong), bukan data personalia
  // karyawan: gerbang laporan pajak umum view_reports — selaras
  // rekonsiliasi-ppn/posisi-spt/faktur-ppn (vonis BOT 4 F-2026-10-21-034).
  await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  // Satu sumber dua sisi untuk layar, PDF, dan CSV (B8): baris lahir dari
  // loader bersama, bukan query per permukaan. Total ketiga permukaan
  // karena itu selalu sama untuk periode yang sama.
  const inputs = await loadWithholdingCertificateInputs(period)
  const byDateThenDoc = (
    a: { date: Date; documentNo: string },
    b: { date: Date; documentNo: string },
  ) => a.date.getTime() - b.date.getTime() || a.documentNo.localeCompare(b.documentNo, "id-ID")
  const purchaseInputs = inputs.filter((r) => r.side === "purchase").sort(byDateThenDoc)
  const salesInputs = inputs.filter((r) => r.side === "sales").sort(byDateThenDoc)

  const rows = purchaseInputs.map((r) => ({
    date: r.date,
    documentNo: r.documentNo,
    vendorName: r.counterparty,
    typeCode: r.typeCode,
    typeName: r.typeName,
    rate: r.rate,
    // Dasar pengenaan pembelian selalu terisi (subtotal − diskon).
    dpp: r.dpp ?? 0,
    withheld: r.withheld,
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
    bucket.amount = safeAdd(bucket.amount, row.withheld, 2)
    byType.set(key, bucket)
  }

  const totalWithheld = rows.reduce((sum, row) => safeAdd(sum, row.withheld, 2), 0)
  const totalDpp = rows.reduce((sum, row) => safeAdd(sum, row.dpp, 2), 0)

  // Sisi penjualan: PPh yang dipotong pelanggan, tercatat di pembayaran.
  const salesRows = salesInputs.map((r) => ({
    date: r.date,
    documentNo: r.documentNo,
    certificateNo: r.certificateNo,
    invoiceNo: r.invoiceNo ?? null,
    customerName: r.counterparty || null,
    typeCode: r.typeCode,
    typeName: r.typeName,
    rate: r.rate,
    withheld: r.withheld,
  }))

  const totalSalesWithheld = salesRows.reduce((sum, row) => safeAdd(sum, row.withheld, 2), 0)
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
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Bukti_Potong_PPh" pdfHref={buildReportPdfHref("bukti-potong-pph", period.slug)} csvData={serializeWithholdingCertificatesCsv(inputs).csv} /></div>
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
              <DetailTableRow><DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada pemotongan PPh pada periode ini" className="py-0" /></DetailTableTd></DetailTableRow>
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
              <DetailTableRow key={row.documentNo}>
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
              <DetailTableRow><DetailTableTd colSpan={7} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada tagihan pemasok dengan pemotongan PPh pada periode ini" className="py-0" /></DetailTableTd></DetailTableRow>
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
              <DetailTableRow key={row.documentNo}>
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
                  <EmptyState title="Tidak ada PPh yang dipotong pelanggan pada periode ini." description="Potongan dicatat saat menerima pembayaran (Penjualan → Pembayaran → terima pembayaran)." className="py-0" />
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
