import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import type {
  AssetUseFlagSummary,
  CronDisposition,
} from "@/lib/finance/asset-use-status"
import {
  assetUseStatusDisplay,
  CRON_SKIP_REASON_LABELS,
  type AssetUseStatusTone,
} from "@/lib/finance/asset-use-status-display"

const TONE_CLASSES: Record<AssetUseStatusTone, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  default: "bg-muted text-muted-foreground",
}

/**
 * Status guna aset dari kontrak F-2026-10-23-117-V — tampil apa adanya.
 * Status tak terdaftar tampil sebagai temuan bernama + nilai mentahnya;
 * UI tidak menebak padanan dan tidak menampilkan label sah palsu.
 */
export function AssetUseStatus({ status }: { status: string | null | undefined }) {
  const display = assetUseStatusDisplay(status)
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge
        variant="outline"
        className={cn("border-transparent font-medium", TONE_CLASSES[display.tone])}
      >
        {display.label}
      </Badge>
      {display.rawStatus !== null && (
        <span className="text-xs text-muted-foreground">
          Nilai tersimpan: {display.rawStatus || "(kosong)"}
        </span>
      )}
    </span>
  )
}

/**
 * Disposisi cron satu aset (classifyCronDisposition) apa adanya:
 * alasan lewatan terdaftar wajib tampil, fiskal-tetap-jalan dinyatakan.
 */
export function AssetCronDisposition({ disposition }: { disposition: CronDisposition }) {
  if (disposition.action === "process") {
    return (
      <span className="text-sm text-muted-foreground">
        Diproses penyusutan periode ini.
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span>{disposition.reason ? CRON_SKIP_REASON_LABELS[disposition.reason] : "Dilewatkan"}</span>
      <span className="text-xs text-muted-foreground">
        {disposition.fiscalContinues
          ? "Penyusutan fiskal tetap berjalan."
          : "Penyusutan fiskal berhenti."}
      </span>
    </span>
  )
}

/**
 * Penanda registry (summarizeAssetUseFlags) apa adanya — pengungkapan
 * tersusutkan-penuh / menganggur / held-for-sale / status tak terdaftar.
 * Menganggur adalah penanda operasional; status aset tetap Aktif.
 */
export function AssetUseFlagSummaryCard({
  summary,
}: {
  summary: Omit<AssetUseFlagSummary, "fullyDepreciatedInUseGross"> & {
    fullyDepreciatedInUseGross: AssetUseFlagSummary["fullyDepreciatedInUseGross"] | number
  }
}) {
  return (
    <section
      aria-label="Penanda status guna aset"
      className="rounded-xl border border-default bg-surface p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-[0.9375rem] font-semibold text-foreground">
        Penanda Status Guna
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">
            Tersusutkan penuh, masih dipakai
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {summary.fullyDepreciatedInUseCount} aset ·{" "}
            {formatCurrency(Number(summary.fullyDepreciatedInUseGross))} bruto
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Menganggur (tetap Aktif)</dt>
          <dd className="text-sm font-medium text-foreground">
            {summary.idleCount} aset
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dimiliki untuk Dijual</dt>
          <dd className="text-sm font-medium text-foreground">
            {summary.heldForSaleCount} aset
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status tidak terdaftar</dt>
          <dd className="text-sm font-medium text-foreground">
            {summary.unregisteredStatusAssetIds.length === 0
              ? "Tidak ada"
              : `ID aset: ${summary.unregisteredStatusAssetIds.join(", ")}`}
          </dd>
        </div>
      </dl>
    </section>
  )
}
