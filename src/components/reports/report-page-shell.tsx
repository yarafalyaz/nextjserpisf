import type { ReactNode } from "react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportSheet } from "@/components/reports/report-sheet"
import { STATEMENT_SIGNATURES } from "@/lib/reports/report-export"

/**
 * Kulit standar halaman laporan — dipakai SEMUA laporan supaya tidak ada lagi
 * tiga generasi tampilan yang berbeda.
 *
 * Urutannya mengikuti report viewer sistem akuntansi: remah → parameter laporan →
 * aksi (PDF/CSV/Cetak) → lembar dokumen (kop, judul, periode, isi, tanda tangan,
 * kaki cetak). Isi laporan hanya menyuplai tabelnya; kop dan kaki diurus di sini.
 */
type ReportPageShellBase = {
  /** Label remah terakhir, mis. "Neraca Saldo". */
  title: string
  /** Parameter laporan (tanggal/filter). Disembunyikan saat mencetak. */
  filter?: ReactNode
  /** Tombol aksi, mis. `<ExportButtons pdfHref=… />`. */
  actions?: ReactNode
  printedBy?: string | null
  signatures?: string[]
  /** Lembar lebar (A4 landscape) untuk laporan bertabel banyak kolom. */
  wide?: boolean
  children: ReactNode
}

/**
 * Dua bentuk pemakaian, dibedakan di level tipe:
 *
 * - default (`sheet` aktif): kop + judul + periode digambar shell, jadi
 *   `sheetTitle`/`periodLabel`/`periodCaption` WAJIB.
 * - `sheet={false}`: laporan sudah menggambar kopnya sendiri (mis.
 *   `ReportLetterhead` di dalam isinya), sehingga prop lembar tidak diperlukan.
 *
 * Dibuat union (bukan opsional semua) supaya prop yang terlupa pada laporan
 * berlembar tidak diam-diam tercetak tanpa periode.
 */
export type ReportPageShellProps = ReportPageShellBase &
  (
    | {
        sheet?: true
        /** Judul di dalam lembar — biasanya sama dengan `title`. */
        sheetTitle: string
        subtitle?: string
        periodLabel: string
        periodCaption: string
      }
    | { sheet: false }
  )

export function ReportPageShell(props: ReportPageShellProps) {
  const {
    title,
    filter,
    actions,
    printedBy,
    signatures = STATEMENT_SIGNATURES,
    wide = false,
    children,
  } = props

  return (
    <div className={`report-page-shell flex flex-col gap-5${wide ? " report-page-shell-wide" : ""}`}>
      <div className="print:hidden">
        <AppBreadcrumbs
          items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: title }]}
        />
      </div>

      {filter || actions ? (
        <div className="print:hidden flex flex-col gap-3">
          {filter}
          {actions ? <div className="flex items-center justify-end">{actions}</div> : null}
        </div>
      ) : null}

      {/* Kanvas dokumen: kertas putih di atas latar gelap (hanya di layar), supaya
          laporan terbaca sebagai dokumen — bukan halaman aplikasi. */}
      <div className="report-canvas">
        {props.sheet === false ? (
          <div className={`report-paper${wide ? " report-paper-wide" : ""}`}>{children}</div>
        ) : (
          <ReportSheet
            title={props.sheetTitle}
            subtitle={props.subtitle}
            periodLabel={props.periodLabel}
            periodCaption={props.periodCaption}
            printedBy={printedBy}
            signatures={signatures}
            wide={wide}
          >
            {children}
          </ReportSheet>
        )}
      </div>
    </div>
  )
}
