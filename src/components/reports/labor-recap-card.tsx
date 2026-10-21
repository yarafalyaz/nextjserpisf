import type { LaborRecap } from "@/lib/reports/labor-recap"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

function technicianName(employeeId: number, name: string | null): string {
  return name ?? `Karyawan #${employeeId}`
}

/**
 * F-2026-10-20-97a (tahap frontend): kartu Rekap Borongan per teknisi.
 *
 * Data dari loader read-only `getLaborRecap` (builder `buildLaborRecap`,
 * PR #271): Σ amount + jam labor per teknisi via join
 * sourceTimesheetId -> Timesheet.employeeId; baris manual tanpa sumber
 * tampil tanpa nama teknisi. Komponen ini murni presentasi — tidak
 * menghitung ulang, tidak membuat tombol bayar, tidak menyentuh
 * jurnal/payroll; notice backend tampil apa adanya.
 */
export function LaborRecapCard({ recap }: Readonly<{ recap: LaborRecap }>) {
  // F-038: undated hanya ada sesudah backend #329 tergabung; guard opsional
  // menjaga kartu tetap jalan di pohon tanpa field itu.
  const undated = (recap as LaborRecap & { undated?: LaborRecap["unattributed"] }).undated
  const hasRows = recap.totalLineCount > 0 || (undated?.lineCount ?? 0) > 0
  return (
    <ReportCardShell
      label="Rekap Borongan Teknisi"
      title="Rekap Borongan Teknisi"
      summary={
        <>
          {recap.technicians.length} teknisi · total {formatCurrency(recap.totalAmount)}
        </>
      }
      isEmpty={!hasRows}
      emptyText="Belum ada baris biaya labor untuk direkap"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Teknisi</DetailTableTh>
          <DetailTableTh align="right">Baris</DetailTableTh>
          <DetailTableTh align="right">Jam</DetailTableTh>
          <DetailTableTh align="right">Total Upah</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {recap.technicians.map((tech) => (
            <DetailTableRow key={tech.employeeId}>
              <DetailTableTd>{technicianName(tech.employeeId, tech.employeeName)}</DetailTableTd>
              <DetailTableTd align="right">{formatNumber(tech.lineCount)}</DetailTableTd>
              <DetailTableTd align="right">{formatNumber(tech.laborHours, 2)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(tech.totalAmount)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total teratribusi</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatNumber(recap.totalLineCount - recap.unattributed.lineCount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatNumber(recap.totalLaborHours - recap.unattributed.laborHours, 2)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(recap.totalAmount - recap.unattributed.totalAmount)}
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>
      {recap.unattributed.lineCount > 0 && (
        <section aria-label="Baris labor tanpa teknisi" className="mt-5">
          <h3 className="text-sm font-semibold text-foreground">
            Tanpa Teknisi (baris manual tanpa timesheet)
          </h3>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kelompok</DetailTableTh>
              <DetailTableTh align="right">Baris</DetailTableTh>
              <DetailTableTh align="right">Jam</DetailTableTh>
              <DetailTableTh align="right">Total Upah</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              <DetailTableRow key="unattributed">
                <DetailTableTd>Tanpa teknisi — jangan ditebak</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(recap.unattributed.lineCount)}</DetailTableTd>
                <DetailTableTd align="right">
                  {formatNumber(recap.unattributed.laborHours, 2)}
                </DetailTableTd>
                <DetailTableTd align="right">
                  {formatCurrency(recap.unattributed.totalAmount)}
                </DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </section>
      )}
      {undated != null && undated.lineCount > 0 && (
        <section aria-label="Baris labor tanggal kerja belum terbukti" className="mt-5">
          <h3 className="text-sm font-semibold text-foreground">
            Tanggal kerja belum terbukti
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Baris ini di luar total periode — tanggal kerjanya tidak terbukti dari timesheet.
          </p>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kelompok</DetailTableTh>
              <DetailTableTh align="right">Baris</DetailTableTh>
              <DetailTableTh align="right">Jam</DetailTableTh>
              <DetailTableTh align="right">Total Upah</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              <DetailTableRow key="undated">
                <DetailTableTd>Tanggal kerja belum terbukti (di luar total periode)</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(undated.lineCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(undated.laborHours, 2)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(undated.totalAmount)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </section>
      )}
      <p className="mt-4 text-sm text-muted-foreground">{recap.notice}</p>
    </ReportCardShell>
  )
}
