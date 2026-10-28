import type { ProjectPlResult } from "@/lib/reports/project-pl"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportCardShell } from "./report-card-shell"

/**
 * Jejak ketertelusuran angka aktual ke transaksi sumbernya (PROJ-BR-004 G3 /
 * BR-PROJ004-12): builder hanya membawa daftar id dokumen yang terhitung,
 * TANPA nomor dokumen/tanggal/nilai per dokumen — UI menampilkan jumlah +
 * id verbatim apa adanya, TIDAK mengarang nomor dokumen dan TIDAK
 * menghitung nilai per dokumen. Null bila sumber tidak membawa daftar id
 * (mis. ProductionCost/Expense/PettyCash di builder tidak ber-id).
 */
function SourceTrace({ label, ids }: Readonly<{ label: string; ids: number[] | null }>) {
  if (ids === null || ids.length === 0) return null
  return (
    <p className="text-xs text-muted-foreground">
      {label}: {ids.length} dokumen (#{ids.join(", #")})
    </p>
  )
}

function CostLine({ label, amount }: Readonly<{ label: string; amount: number }>) {
  return (
    <div>
      <span className="text-muted-foreground block">{label}:</span>
      <span className="font-semibold text-danger">{formatCurrency(amount)}</span>
    </div>
  )
}

/**
 * F-2026-10-21-029 (tahap frontend): ringkasan L/R satu proyek di detail proyek.
 *
 * Murni presentasi dari `loadProjectPlForProject` (builder `buildProjectPl`
 * yang sama dengan halaman laporan): pendapatan, rincian biaya, laba, dan
 * margin tampil apa adanya — tidak ada agregasi quotation per-pelanggan dan
 * tidak ada hitung ulang uang di UI. Memo jam timesheet belum ditarik tampil
 * terpisah dengan label jelas: bukan biaya, tidak mengurangi laba.
 *
 * AC-PROJ-003 (t_9b516ac7): kartu ini sisi AKTUAL pasangan kartu
 * Estimasi vs Aktual — pendapatan/biaya di sini semuanya biaya aktual dari
 * transaksi sumber (invoice, pengeluaran material, biaya produksi, tagihan
 * vendor). Label "aktual (terealisasi)" eksplisit per baris biaya; laba =
 * margin job kendaraan, BUKAN laba akuntansi (keputusan 11).
 */
export function ProjectPlDetailCard({ pl }: Readonly<{ pl: ProjectPlResult }>) {
  const otherCost = pl.expenseCost + pl.pettyCashCost + pl.vendorBillCost
  const isEmpty =
    pl.revenue === 0 &&
    pl.totalCost === 0 &&
    pl.revenueInvoiceIds.length === 0 &&
    pl.materialIssueIds.length === 0 &&
    pl.unpulledTimesheetCount === 0

  return (
    <ReportCardShell
      label="Laba Rugi Proyek"
      title="Aktual Proyek (Laba Rugi)"
      summary={<>Sumber: biaya aktual L/R proyek (invoice, pengeluaran material, biaya produksi, beban)</>}
      isEmpty={isEmpty}
      emptyText="Belum ada data laba rugi untuk proyek ini"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className={`text-2xl font-black ${pl.profit < 0 ? "text-danger" : "text-foreground"}`}>
            {formatCurrency(pl.profit)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Laba (Rugi) Proyek</p>
        </div>
        <span
          className={`text-xs font-bold ${pl.profit < 0 ? "text-danger" : "text-success"}`}
        >
          {pl.profit >= 0 ? "+" : ""}
          {pl.marginPercent.toFixed(1)}% margin
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-default/50 pt-3 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground block">Pendapatan Aktual (invoice diakui):</span>
          <span className="font-semibold text-foreground">{formatCurrency(pl.revenue)}</span>
          <SourceTrace label="Invoice sumber" ids={pl.revenueInvoiceIds} />
        </div>
        <div>
          <span className="text-muted-foreground block">Total Biaya Aktual:</span>
          <span className="font-semibold text-danger">{formatCurrency(pl.totalCost)}</span>
        </div>
        <div>
          <CostLine label="Material Aktual" amount={pl.materialCost} />
          <SourceTrace label="Pengeluaran material sumber" ids={pl.materialIssueIds} />
        </div>
        <CostLine label="Biaya Produksi Aktual" amount={pl.productionCost} />
        <div>
          <CostLine label="Beban Aktual Lain (biaya, kas kecil, tagihan vendor)" amount={otherCost} />
          <SourceTrace label="Tagihan vendor sumber" ids={pl.vendorBillIds} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Laba di atas = margin job kendaraan (pendapatan aktual − biaya aktual terealisasi), bukan laba akuntansi.
      </p>

      {pl.unpulledTimesheetCount > 0 && (
        <section aria-label="Memo jam timesheet belum ditarik" className="mt-4 border-t border-default/50 pt-3">
          <h3 className="text-sm font-semibold text-foreground">Memo Jam Timesheet Belum Ditarik</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(pl.unpulledTimesheetHours, 2)} jam dari {formatNumber(pl.unpulledTimesheetCount)}{" "}
            baris timesheet belum ditarik ke biaya produksi — memo jam saja, bukan biaya dan tidak mengurangi laba.
          </p>
        </section>
      )}
    </ReportCardShell>
  )
}
