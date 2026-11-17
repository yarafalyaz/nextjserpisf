import type {
  DisciplinaryDeductionApplicationStatus,
  DisciplinaryDeductionDecisionRow,
} from "@/lib/reports/disciplinary-deduction-data"
import { ApplyDisciplinaryDeductionButton } from "@/components/reports/apply-disciplinary-deduction-button"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

export const DISC09_DECISIONS_TITLE = "Keputusan Potongan Disiplin"

/**
 * Bug KM2: keputusan potongan disiplin BELUM diterapkan otomatis ke slip
 * payroll (`applyDisciplinaryDeduction` belum punya pemanggil produksi).
 * Penanda ini wajib tampil selama itu benar supaya layar tidak membohongi
 * pembaca: dokumen keputusan tidak sama dengan potongan yang sudah terjadi.
 */
export const DISC09_NOT_APPLIED_WARNING =
  "Potongan disiplin TIDAK masuk otomatis ke slip gaji. Keputusan yang baru dicatat belum memotong apa pun sampai Anda menekan Terapkan ke Periode pada barisnya. Penerapan memposting jurnal tersendiri (Dr Hutang Gaji, Cr Denda atau akun kompensasi), bukan lewat nominaal slip."

export const DISC09_DECISIONS_NOTICE_TEXT =
  "Nominal, jenis potongan, perlakuan upah skorsing, dan dasar peraturan adalah snapshot dokumen keputusan, ditampilkan apa adanya tanpa hitung ulang. Surat peringatan tidak memicu potongan."

/**
 * Konsumen snapshot BR-DISC-09: permukaan daftar keputusan potongan
 * disiplin dari loader server. Murni presentasi verbatim; tanpa izin
 * nominal (amount null dari server) kolom nominal tampil status
 * eksplisit, bukan angka kosong.
 */
export function DisciplinaryDeductionDecisionsCard({
  decisions,
  applicationStatus,
  defaultPeriod,
}: Readonly<{
  decisions: DisciplinaryDeductionDecisionRow[]
  applicationStatus?: DisciplinaryDeductionApplicationStatus
  /** Periode payroll awal pada form "Terapkan ke Periode" (YYYY-MM). Default bulan berjalan. */
  defaultPeriod?: string
}>) {
  const periodeAwal = defaultPeriod ?? new Date().toISOString().slice(0, 7)
  return (
    <ReportCardShell
      label={DISC09_DECISIONS_TITLE}
      title={DISC09_DECISIONS_TITLE}
      summary={`${decisions.length} dokumen keputusan dalam cakupan Anda`}
      isEmpty={decisions.length === 0}
      emptyText="Belum ada dokumen keputusan potongan disiplin dalam cakupan Anda"
      notice={DISC09_DECISIONS_NOTICE_TEXT}
    >
      {applicationStatus ? (
        <p
          role="status"
          data-testid="disc09-not-applied-warning"
          className="mb-3 rounded-md border border-warning/50 bg-warning-soft px-3 py-2 text-xs text-foreground"
        >
          {DISC09_NOT_APPLIED_WARNING}
          {` Tercatat: ${applicationStatus.decisions} keputusan, ${applicationStatus.applied} sudah dibukukan lewat jurnal potongan, ${applicationStatus.pending} belum dipotong.`}
        </p>
      ) : null}
      <DetailTable aria-label="Daftar keputusan potongan disiplin">
        <DetailTableHead>
          <DetailTableTh>Nomor Dokumen</DetailTableTh>
          <DetailTableTh>Tanggal Keputusan</DetailTableTh>
          <DetailTableTh>Karyawan</DetailTableTh>
          <DetailTableTh>Jenis Potongan</DetailTableTh>
          <DetailTableTh>Nominal Keputusan</DetailTableTh>
          <DetailTableTh>Skorsing</DetailTableTh>
          <DetailTableTh>Perlakuan Upah</DetailTableTh>
          <DetailTableTh>Dasar Peraturan</DetailTableTh>
          <DetailTableTh>Akun Kompensasi</DetailTableTh>
          <DetailTableTh>Konteks SP</DetailTableTh>
          <DetailTableTh>Ditandatangani Oleh</DetailTableTh>
          <DetailTableTh>Aksi</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {decisions.map((row) => (
            <DetailTableRow key={row.id}>
              <DetailTableTd>{row.documentNo}</DetailTableTd>
              <DetailTableTd>{formatDate(row.decidedAt)}</DetailTableTd>
              <DetailTableTd>{row.employeeName}</DetailTableTd>
              <DetailTableTd>{row.kind}</DetailTableTd>
              <DetailTableTd>
                {row.amount != null ? (
                  formatCurrency(row.amount, { decimals: 2 })
                ) : (
                  <span className="text-muted-foreground">Nominal tidak ditampilkan (tanpa izin lihat payroll)</span>
                )}
              </DetailTableTd>
              <DetailTableTd>{row.suspensionKind ?? "—"}</DetailTableTd>
              <DetailTableTd>{row.suspensionPayTreatment ?? "—"}</DetailTableTd>
              <DetailTableTd>{row.regulationReference ?? "—"}</DetailTableTd>
              <DetailTableTd>{row.compensationAccountLabel ?? "—"}</DetailTableTd>
              <DetailTableTd>{row.contextDocumentNo ?? "—"}</DetailTableTd>
              <DetailTableTd>{row.signerName}</DetailTableTd>
              <DetailTableTd>
                <ApplyDisciplinaryDeductionButton
                  decisionId={row.id}
                  documentNo={row.documentNo}
                  defaultPeriod={periodeAwal}
                />
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </ReportCardShell>
  )
}

/** Seksi konteks keputusan pada rincian satu SP: konteks saja, nol nominal SP. */
export function DisciplinaryDeductionRecordContext({
  decisions,
}: Readonly<{ decisions: DisciplinaryDeductionDecisionRow[] }>) {
  if (decisions.length === 0) return null
  return (
    <section
      aria-label="Keputusan potongan terkait rekod ini"
      className="rounded-xl border border-default bg-surface p-5 shadow-sm"
    >
      <h2 className="text-[0.9375rem] font-semibold text-foreground">Keputusan Potongan Terkait</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Dokumen keputusan berikut menautkan rekod ini sebagai konteks saja, surat peringatan tidak memicu
        potongan. Snapshot keputusan ditampilkan apa adanya.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {decisions.map((row) => (
          <div key={row.id} className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              {row.documentNo} · {formatDate(row.decidedAt)}
            </dt>
            <dd className="text-sm text-foreground">
              {row.kind}
              {row.amount != null
                ? ` · ${formatCurrency(row.amount, { decimals: 2 })}`
                : " · Nominal tidak ditampilkan (tanpa izin lihat payroll)"}
              {row.suspensionKind ? ` · Skorsing ${row.suspensionKind}` : ""}
              {row.suspensionPayTreatment ? ` · Upah ${row.suspensionPayTreatment}` : ""}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
