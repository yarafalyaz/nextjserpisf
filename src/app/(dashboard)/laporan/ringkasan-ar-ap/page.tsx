export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { loadArApSummary } from "@/lib/reports/ar-ap-summary-data"
import type { TableRow } from "@/lib/pdf/engine/types"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Ringkasan AR/AP" }

/**
 * 120-S: layar murni render keluaran loader kanonis `loadArApSummary`
 * (satu sumber dengan PDF: presisi sen + returnCredit + AP NETO).
 * Tanpa query prisma, tanpa hitung manual sendiri, tanpa saring
 * ambang sendiri — partisi baris per seksi + ambang tampil
 * ikut loader apa adanya. Sel angka ditampilkan verbatim dari loader.
 */
export default async function ArApSummaryPage() {
  await requirePermission('view_reports')

  const report = await loadArApSummary()

  // Partisi baris tabel kanonis per kelompok — urutan + isi ikut loader.
  const arCells: string[][] = []
  const apCells: string[][] = []
  let arTotal = "0"
  let apTotal = "0"
  let netTotal = "0"
  let notice: string | null = null
  let group: "ar" | "ap" | null = null
  for (const row of report.table.rows) {
    if (row.kind === "group") {
      group = row.label === "Piutang Usaha" ? "ar" : row.label === "Hutang Usaha" ? "ap" : null
    } else if (row.kind === "data") {
      if (group === "ar") arCells.push(row.cells)
      else if (group === "ap") apCells.push(row.cells)
    } else if (row.kind === "total" && !row.grand) {
      if (row.label === "Jumlah Piutang") arTotal = lastCell(row)
      else if (row.label === "Jumlah Hutang") apTotal = lastCell(row)
    } else if (row.kind === "total" && row.grand) {
      netTotal = lastCell(row)
    } else if (row.kind === "notice") {
      notice = row.text
    }
  }

  // formatAccounting: negatif dalam kurung — satu-satunya penanda arah
  // untuk warna kartu Posisi Bersih; bukan hitung ulang, hanya baca format.
  const netNegative = netTotal.startsWith("(")

  return (
    <ReportPageShell title="Ringkasan AR/AP" sheet={false} wide actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Ringkasan_AR_AP" pdfHref={buildReportPdfHref("ringkasan-ar-ap", buildReportPeriodSlug(new Date(), new Date()))} />
      </div>
</>}>



      <ReportLetterhead title="Ringkasan Piutang & Hutang" periodLabel={report.periodLabel} />
      <ReportNarration text="Laporan Ringkasan Piutang dan Utang menyajikan ikhtisar saldo piutang usaha dan utang usaha perusahaan. Informasi ini penting untuk mengelola arus kas dan memastikan kewajiban pembayaran kepada pemasok serta tagihan kepada pelanggan terpantau dengan baik." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Piutang (AR)" value={arTotal} valueClassName="text-primary" />
        <ReportKpiCard label="Total Hutang (AP)" value={apTotal} valueClassName="text-danger" />
        <ReportKpiCard
          label="Posisi Bersih"
          value={netTotal}
          valueClassName={netNegative ? 'text-danger' : 'text-success'}
        />
      </div>

      <ReportSection title="Piutang Usaha">
        <DetailTable data-report-table="Piutang Usaha">
          <DetailTableHead>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh align="right">Jumlah Faktur</DetailTableTh>
            <DetailTableTh align="right">Total Tagihan</DetailTableTh>
            <DetailTableTh align="right">Sudah Dibayar</DetailTableTh>
            <DetailTableTh align="right">Belum Lunas</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {arCells.map((cells, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{cells[0]}</DetailTableTd>
                <DetailTableTd align="right">{cells[1]}</DetailTableTd>
                <DetailTableTd align="right">{cells[2]}</DetailTableTd>
                <DetailTableTd align="right">{cells[3]}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-primary">{cells[4]}</DetailTableTd>
              </DetailTableRow>
            ))}
            {arCells.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada piutang belum lunas" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {arCells.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{arCells.length}</DetailTableTd>
                <DetailTableTd align="right" colSpan={2}>{""}</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{arTotal}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Hutang Usaha">
        <DetailTable data-report-table="Hutang Usaha">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh align="right">Jumlah Tagihan</DetailTableTh>
            <DetailTableTh align="right">Total Tagihan</DetailTableTh>
            <DetailTableTh align="right">Sudah Dibayar</DetailTableTh>
            <DetailTableTh align="right">Belum Lunas</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {apCells.map((cells, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{cells[0]}</DetailTableTd>
                <DetailTableTd align="right">{cells[1]}</DetailTableTd>
                <DetailTableTd align="right">{cells[2]}</DetailTableTd>
                <DetailTableTd align="right">{cells[3]}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{cells[4]}</DetailTableTd>
              </DetailTableRow>
            ))}
            {apCells.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada hutang belum lunas" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {apCells.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{apCells.length}</DetailTableTd>
                <DetailTableTd align="right" colSpan={2}>{""}</DetailTableTd>
                <DetailTableTd align="right" className="text-danger">{apTotal}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
      {notice && <p className="doc-lines" style={{ marginTop: 8 }}>{notice}</p>}
    </ReportPageShell>
  )
}

/** Sel angka terakhir baris total kanonis — tampil verbatim di layar. */
function lastCell(row: Extract<TableRow, { kind: "total" }>): string {
  return row.cells[row.cells.length - 1] ?? "0"
}
