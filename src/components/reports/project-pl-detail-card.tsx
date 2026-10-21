import type { ProjectPlResult } from "@/lib/reports/project-pl"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportCardShell } from "./report-card-shell"

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
      title="Laba Rugi Proyek"
      summary={<>Sumber: builder L/R proyek (invoice, material, biaya produksi, beban)</>}
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
          <span className="text-muted-foreground block">Pendapatan (invoice diakui):</span>
          <span className="font-semibold text-foreground">{formatCurrency(pl.revenue)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Total Biaya:</span>
          <span className="font-semibold text-danger">{formatCurrency(pl.totalCost)}</span>
        </div>
        <CostLine label="Material" amount={pl.materialCost} />
        <CostLine label="Biaya Produksi" amount={pl.productionCost} />
        <CostLine label="Beban Lain (biaya, kas kecil, tagihan vendor)" amount={otherCost} />
      </div>

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
