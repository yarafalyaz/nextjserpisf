import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { AssetAnalyticalStatusRow } from "@/lib/reports/asset-analytical-status-data"
import { DEPRECIATION_METHOD_LABELS } from "./asset-fiscal-status"

const SKIP_TEXT: Record<string, string> = {
  "at-residual": "Nilai buku sudah mencapai nilai residu — tidak ada beban periode ini.",
  "unit-nol": "Unit aktual periode ini 0 — beban Rp0.",
  "held-for-sale": "Aset ditahan untuk dijual — penyusutan komersial dihentikan.",
  disposed: "Aset sudah dilepas — tidak ada beban analitis.",
  "already-posted": "Penyusutan masa ini sudah berjurnal.",
  "not-started": "Penyusutan belum mulai pada masa ini.",
}

const PARAM_LABELS: Record<string, string> = {
  actualUnits: "Unit aktual",
  totalEstimatedUnits: "Total estimasi unit",
  usefulLifeMonths: "Masa manfaat (bulan)",
  monthIndex: "Bulan berjalan",
  depreciationMethod: "Metode penyusutan",
}

/**
 * Render status analitis dari loader backend apa adanya (F-118-V).
 * UI tidak menghitung beban dan tidak menawarkan posting analitis.
 */
export function AssetAnalyticalStatus({ row, periodLabel }: { row: AssetAnalyticalStatusRow; periodLabel: string }) {
  const s = row.status
  const method = DEPRECIATION_METHOD_LABELS[row.depreciationMethod] ?? row.depreciationMethod
  const unitSuffix = row.productionUnitName ? ` ${row.productionUnitName}` : ""

  let badge: React.ReactNode
  let detail: string
  if (s.status === "computed") {
    badge = <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Terhitung analitis</Badge>
    detail = `Beban analitis ${periodLabel}: ${formatCurrency(s.amount.toString())}`
  } else if (s.status === "skip") {
    badge = <Badge className="border-transparent bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400">Tidak ada beban</Badge>
    detail = SKIP_TEXT[s.reason] ?? s.reason
  } else if (s.reason === "missing-parameter") {
    badge = <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">Parameter belum lengkap</Badge>
    detail = `Parameter ${PARAM_LABELS[s.parameter] ?? s.parameter} belum terbekukan — hasil analitis belum dapat ditampilkan.`
  } else {
    badge = <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">Status tidak dikenal</Badge>
    detail = `Status aset "${s.method}" tidak terdaftar.`
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-2">{badge}<span>{method}</span></span>
      <span className="text-xs text-muted-foreground">{detail}</span>
      {row.notJournaled && <span className="text-xs text-muted-foreground">Belum ada jurnal perolehan POSTED — status tidak boleh dipakai posting.</span>}
      <span className="text-xs text-muted-foreground">
        {row.depreciationMethod === "units_of_production" && <>Total estimasi unit: {row.totalEstimatedUnits ? `${formatNumber(row.totalEstimatedUnits.toString(), 2)}${unitSuffix}` : "belum terbekukan"} · Unit aktual masa ini: {row.actualUnits ? `${formatNumber(row.actualUnits.toString(), 2)}${unitSuffix}${row.actualSourceName ? ` (${row.actualSourceName})` : ""}` : "dokumen belum ada"} · </>}
        {row.depreciationMethod === "sum_of_years_digits" && <>Masa manfaat terbekukan: {row.usefulLifeMonths ? `${row.usefulLifeMonths} bulan` : "belum terbekukan"} · </>}
        Nilai buku (jurnal POSTED): {formatCurrency(row.bookValue.toString())}
      </span>
      <span className="text-xs text-muted-foreground">Analitis saja — tidak melahirkan jurnal dari kartu ini. Posting jurnal hanya untuk Garis Lurus dan Saldo Menurun.</span>
    </span>
  )
}
